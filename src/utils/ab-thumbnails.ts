import { Cache } from "@raycast/api";

/**
 * A thumbnail from YouTube's "Test & compare" experiment, which serves a different cover to
 * different viewers. yt-dlp does not report these, and they cannot be guessed: they live at
 * `.../<id>/hq720_custom_<n>.jpg`, but only answer with a signed `sqp`/`rs` query, and the
 * signature covers the path — editing the index gives back a placeholder.
 *
 * The signed URLs are handed out by YouTube's own feeds. Each request is put in one experiment
 * bucket, so the search page is asked a few times until no new variant comes back.
 */
export interface AbVariant {
  /** The `_custom_<n>` index YouTube uses, from 1. */
  index: number;
  url: string;
}

export interface Sweep {
  variants: AbVariant[];
  /** True when YouTube cut the sweep short, so what was found may be incomplete. */
  interrupted: boolean;
}

const SEARCH_URL = "https://www.youtube.com/results?search_query=";

// An old browser string sends YouTube into a consent redirect loop, so this one is current.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** A creator can test at most three covers, so there is nothing to look for after three. */
const MAX_VARIANTS = 3;
/** Each round is one search page, about 260 KB compressed. */
const MAX_ROUNDS = 12;
/**
 * How many rounds may bring nothing new before the sweep gives up. Two are enough to say a
 * video is not being tested, but once one cover is known the video *is* under test: every
 * request is a fresh draw from the buckets, so a stubborn variant needs several more tries.
 */
const DRY_ROUNDS_WHEN_EMPTY = 2;
const DRY_ROUNDS_WHEN_FOUND = 4;
/** Enough signed URLs per variant to find the largest render, without a HEAD storm. */
const MAX_URLS_PER_VARIANT = 4;

const ROUND_TIMEOUT_MS = 15_000;

/** Rounds fired back to back trip YouTube's bot check, so they are spaced out. The sweep runs
 * in the background behind a grid that is already filled, so the wait costs the user nothing. */
const ROUND_GAP_MS = 800;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** YouTube answered with its "unusual traffic" check instead of results. */
class RateLimitedError extends Error {
  constructor() {
    super("YouTube asked for a bot check instead of answering the search.");
    this.name = "RateLimitedError";
  }
}

const fetchSearchPage = async (videoId: string, round: number, signal?: AbortSignal) => {
  try {
    const response = await fetch(`${SEARCH_URL}${videoId}&cb=${round}`, {
      // Following the consent hop loops forever, and its page holds no thumbnails anyway.
      redirect: "manual",
      signal: signal ?? AbortSignal.timeout(ROUND_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en" },
    });

    // Asking again after a bot check only makes it worse, so it ends the sweep.
    if (response.status === 302 && response.headers.get("location")?.includes("/sorry/")) {
      throw new RateLimitedError();
    }
    if (!response.ok) return "";

    // The URLs sit inside a JSON blob in the page, where `&` is escaped one of two ways.
    return (await response.text()).replaceAll("\\u0026", "&").replaceAll("&amp;", "&");
  } catch (error) {
    // A superseded search must not be cached as a result, so only a real failure is swallowed.
    if (signal?.aborted || error instanceof RateLimitedError) throw error;
    return "";
  }
};

const collectVariantUrls = (html: string, videoId: string, into: Map<number, Set<string>>) => {
  // The id is always 11 word characters, so it is safe to put straight into the pattern.
  const pattern = new RegExp(
    `https://i\\.ytimg\\.com/vi/${videoId}/[a-z0-9_]*custom_(\\d+)\\.(?:jpg|webp)\\?[^"'\\\\\\s]+`,
    "g",
  );

  for (const match of html.matchAll(pattern)) {
    const index = Number(match[1]);
    if (!Number.isInteger(index) || index < 1) continue;

    const urls = into.get(index) ?? new Set<string>();
    if (urls.size < MAX_URLS_PER_VARIANT) urls.add(match[0]);
    into.set(index, urls);
  }
};

/** The byte size of a signed URL, used to pick the biggest render YouTube offers of a variant. */
const contentLength = async (url: string, signal?: AbortSignal) => {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: signal ?? AbortSignal.timeout(ROUND_TIMEOUT_MS),
    });
    const length = Number(response.headers.get("content-length"));
    return response.ok && Number.isFinite(length) ? length : 0;
  } catch {
    return 0;
  }
};

// The feeds render the same variant at several sizes, from 360 × 202 up to 720 × 404. The
// signature is tied to the size, so the largest one has to be picked, not built.
const pickLargest = async (urls: string[], signal?: AbortSignal) => {
  if (urls.length === 1) return urls[0];

  const sized = await Promise.all(urls.map(async (url) => ({ url, bytes: await contentLength(url, signal) })));
  return sized.sort((a, b) => b.bytes - a.bytes)[0].url;
};

const harvestVariants = async (videoId: string, signal?: AbortSignal): Promise<Sweep> => {
  const byIndex = new Map<number, Set<string>>();
  let dryRounds = 0;
  let interrupted = false;

  for (let round = 0; round < MAX_ROUNDS && byIndex.size < MAX_VARIANTS; round++) {
    if (round > 0) await sleep(ROUND_GAP_MS);

    const before = byIndex.size;
    try {
      collectVariantUrls(await fetchSearchPage(videoId, round, signal), videoId, byIndex);
    } catch (error) {
      if (!(error instanceof RateLimitedError)) throw error;
      interrupted = true;
      break;
    }
    dryRounds = byIndex.size > before ? 0 : dryRounds + 1;

    if (dryRounds >= (byIndex.size === 0 ? DRY_ROUNDS_WHEN_EMPTY : DRY_ROUNDS_WHEN_FOUND)) break;
  }

  const variants = await Promise.all(
    [...byIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(async ([index, urls]) => ({ index, url: await pickLargest([...urls], signal) })),
  );

  return { variants, interrupted };
};

interface CachedSweep {
  variants: AbVariant[];
  sweptAt: number;
  interrupted?: boolean;
}

const cache = new Cache();
const cacheKey = (videoId: string) => `yt-ab-thumbnails:${videoId}`;

const readSweep = (videoId: string): CachedSweep | undefined => {
  const raw = cache.get(cacheKey(videoId));
  if (!raw) return undefined;

  try {
    const sweep = JSON.parse(raw) as CachedSweep;
    return Array.isArray(sweep.variants) ? sweep : undefined;
  } catch {
    return undefined;
  }
};

/**
 * How long a sweep is trusted. Finding nothing is the common answer and costs two search pages,
 * so it is kept for a day. An incomplete set is worth topping up soon, because each sweep draws
 * from the test buckets at random and may simply have missed one. A sweep that YouTube cut short
 * proves nothing at all, so it is only kept long enough to stop a retry loop.
 */
const trustedFor = ({ variants, interrupted }: { variants: AbVariant[]; interrupted?: boolean }) => {
  if (interrupted) return 1000 * 60 * 5;
  if (variants.length === 0) return 1000 * 60 * 60 * 24;
  if (variants.length >= MAX_VARIANTS) return 1000 * 60 * 60 * 2;
  return 1000 * 60 * 15;
};

/**
 * A signed URL carries the quarter-hour it was issued in and does not live forever, so the
 * cached ones are asked whether they still resolve before being shown again.
 */
const stillAlive = async (variants: AbVariant[], signal?: AbortSignal) => {
  const checked = await Promise.all(
    variants.map(async (variant) => ((await contentLength(variant.url, signal)) > 0 ? variant : undefined)),
  );
  return checked.filter((variant): variant is AbVariant => variant !== undefined);
};

/** Later sweeps win, because their URLs are freshly signed. */
const merge = (kept: AbVariant[], swept: AbVariant[]) => {
  const byIndex = new Map(kept.map((variant) => [variant.index, variant]));
  for (const variant of swept) byIndex.set(variant.index, variant);
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
};

/**
 * The tested covers of a video. Results accumulate across sweeps: one sweep can miss a variant
 * whose bucket it never landed in, so what it finds is merged into what is already known rather
 * than replacing it.
 */
export const findAbVariants = async (videoId: string, signal?: AbortSignal): Promise<Sweep> => {
  const cached = readSweep(videoId);
  const alive = cached ? await stillAlive(cached.variants, signal) : [];

  // A URL that has expired must be replaced whatever the age of the sweep says.
  const isIntact = cached ? alive.length === cached.variants.length : false;
  const isFresh = cached
    ? Date.now() - cached.sweptAt < trustedFor({ variants: alive, interrupted: cached.interrupted })
    : false;
  if (cached && isIntact && isFresh) return { variants: alive, interrupted: cached.interrupted ?? false };

  const swept = await harvestVariants(videoId, signal);
  const variants = merge(alive, swept.variants);
  cache.set(
    cacheKey(videoId),
    JSON.stringify({ variants, sweptAt: Date.now(), interrupted: swept.interrupted } satisfies CachedSweep),
  );

  return { variants, interrupted: swept.interrupted };
};
