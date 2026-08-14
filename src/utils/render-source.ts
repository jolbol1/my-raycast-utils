import { Cache, environment } from "@raycast/api";
import { createHash } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import path from "path";
import { FIVE_MINUTES_MS, ONE_WEEK_MS } from "./cache";
import { fetchSvg } from "./fetch";
import { sanitizeForRaycast } from "./sanitize-svg";

/**
 * Raycast cannot render `clip-path="url(#…)"`, so those icons come out blank when the
 * remote URL is handed straight to `Image.Source`. For the icons that need it we write a
 * sanitised copy to disk and point Raycast at that file instead.
 *
 * The decision (sanitised file, or "the original source is fine") is kept in Raycast's
 * Cache, which reads synchronously — so once warm the grid renders with no async work.
 */

const cache = new Cache();
const cacheKey = (url: string) => `svgl_render_${url}`;

const isLocalPath = (route: string) => route.startsWith("/");

// Local icons can be edited on disk, so their decision is re-checked far more often.
const ttlFor = (url: string) => (isLocalPath(url) ? FIVE_MINUTES_MS : ONE_WEEK_MS);

const renderDir = path.join(environment.supportPath, "render-cache");
const sanitizedPathFor = (url: string) => path.join(renderDir, `${createHash("sha1").update(url).digest("hex")}.svg`);

interface CachedDecision {
  /** Path to the sanitised copy, or null when the original source renders correctly. */
  file: string | null;
  timestamp: number;
}

/** Synchronous lookup, so the first render can already use the right source. */
export const getCachedRenderSource = (url: string): string | undefined => {
  const raw = cache.get(cacheKey(url));
  if (!raw) {
    return undefined;
  }

  try {
    const { file, timestamp } = JSON.parse(raw) as CachedDecision;
    if (Date.now() - timestamp >= ttlFor(url)) {
      return undefined;
    }
    if (file === null) {
      return url;
    }
    return existsSync(file) ? file : undefined;
  } catch {
    return undefined;
  }
};

// A cold cache would otherwise fire one request per icon in the grid at once.
const MAX_CONCURRENT = 6;
let active = 0;
const waiting: (() => void)[] = [];

const acquire = () =>
  new Promise<void>((resolve) => {
    if (active < MAX_CONCURRENT) {
      active++;
      resolve();
    } else {
      waiting.push(() => {
        active++;
        resolve();
      });
    }
  });

const release = () => {
  active--;
  waiting.shift()?.();
};

const inFlight = new Map<string, Promise<string>>();

export const resolveRenderSource = async (url: string): Promise<string> => {
  const cached = getCachedRenderSource(url);
  if (cached !== undefined) {
    return cached;
  }

  const existing = inFlight.get(url);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    await acquire();
    try {
      let file: string | null = null;

      try {
        const svg = await fetchSvg(url);
        const sanitized = sanitizeForRaycast(svg);
        if (sanitized !== null) {
          mkdirSync(renderDir, { recursive: true });
          const target = sanitizedPathFor(url);
          await writeFile(target, sanitized, "utf-8");
          file = target;
        }
      } catch {
        // Unreachable icon or unreadable file: fall back to the original source,
        // which is exactly what Raycast would have been given anyway.
        file = null;
      }

      cache.set(cacheKey(url), JSON.stringify({ file, timestamp: Date.now() } satisfies CachedDecision));
      return file ?? url;
    } finally {
      release();
      inFlight.delete(url);
    }
  })();

  inFlight.set(url, task);
  return task;
};
