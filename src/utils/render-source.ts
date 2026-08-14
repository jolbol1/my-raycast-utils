import { Cache, environment } from "@raycast/api";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { FIVE_MINUTES_MS, ONE_WEEK_MS } from "./cache";
import { fetchSvgSource } from "./fetch";
import { isResvgMissing, rasterize } from "./resvg";

/**
 * Raycast's image rendering is an incomplete SVG implementation: it does not resolve
 * `clip-path`, ignores `mask-type: alpha`, and understands only the legacy `xlink:href`
 * on `<use>`. Roughly one icon in six in the svgl library uses at least one of those and
 * renders as a blank tile.
 *
 * Rather than rewriting each of those constructs into something Raycast happens to
 * support, icons are rasterised with resvg — a complete renderer — and Raycast is handed a
 * PNG. The whole library rasterises in a couple of seconds and is then cached on disk, so
 * this costs a one-off delay in exchange for every icon rendering as its author drew it.
 */

/** Bumped when rasterisation changes, so output cached by older logic is discarded. */
const RENDER_VERSION = 4;

/** Thumbnail width. The grid shows icons small; this stays sharp on retina displays. */
const RENDER_WIDTH = 256;

const cache = new Cache();
const cacheKey = (url: string) => `svgl_render_v${RENDER_VERSION}_${url}`;

const isLocalPath = (route: string) => route.startsWith("/");

// Local icons can be edited on disk, so their raster is re-checked far more often.
const ttlFor = (url: string) => (isLocalPath(url) ? FIVE_MINUTES_MS : ONE_WEEK_MS);

const renderDir = path.join(environment.supportPath, "render-cache");
const versionMarker = path.join(renderDir, ".version");

/**
 * Renders are keyed by the SVG's *content*, not its URL: if svgl republishes an icon at
 * the same address the hash changes and a fresh PNG is produced, and identical artwork
 * shared between variants or icons is only ever rasterised once.
 */
const pngPathForContent = (svg: string) =>
  path.join(renderDir, `${createHash("sha1").update(`${RENDER_WIDTH}:${svg}`).digest("hex")}.png`);

/** Clears renders left behind by an older version. */
const ensureRenderDir = () => {
  mkdirSync(renderDir, { recursive: true });
  try {
    if (readFileSync(versionMarker, "utf-8") === String(RENDER_VERSION)) {
      return;
    }
  } catch {
    // No marker yet: fall through and (re)initialise the directory.
  }
  for (const entry of readdirSync(renderDir)) {
    if (entry !== ".version") {
      rmSync(path.join(renderDir, entry), { force: true });
    }
  }
  writeFileSync(versionMarker, String(RENDER_VERSION), "utf-8");
};

/**
 * Drops every cached icon, list and render. Remote content is otherwise held for a week,
 * so this is the escape hatch when svgl republishes an icon and you want it now.
 */
export const clearRenderCache = () => {
  cache.clear();
  try {
    rmSync(renderDir, { recursive: true, force: true });
  } catch {
    // Nothing cached yet, or already gone.
  }
};

interface CachedRender {
  /** Path to the rasterised PNG, or null when the original source has to be used. */
  file: string | null;
  timestamp: number;
}

/** Synchronous lookup, so a warm cache renders the grid with no async work at all. */
export const getCachedRenderSource = (url: string): string | undefined => {
  const raw = cache.get(cacheKey(url));
  if (!raw) {
    return undefined;
  }

  try {
    const { file, timestamp } = JSON.parse(raw) as CachedRender;
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

// A cold cache would otherwise spawn one resvg process per icon in the grid at once.
const MAX_CONCURRENT = 8;
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

/** Rasterises the given SVG source, reusing an existing render of identical content. */
const renderToPng = async (svg: string): Promise<string> => {
  const target = pngPathForContent(svg);
  if (existsSync(target)) {
    return target;
  }

  const scratch = path.join(os.tmpdir(), `${path.basename(target, ".png")}.svg`);
  try {
    await writeFile(scratch, svg, "utf-8");
    return await rasterize(scratch, target, { width: RENDER_WIDTH });
  } finally {
    rmSync(scratch, { force: true });
  }
};

export const resolveRenderSource = async (url: string): Promise<string> => {
  const cached = getCachedRenderSource(url);
  if (cached !== undefined) {
    return cached;
  }

  // With no resvg there is nothing to rasterise with, so let Raycast render the SVG
  // itself — imperfect, but the previous behaviour rather than nothing at all.
  if (isResvgMissing()) {
    return url;
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
        ensureRenderDir();
        file = await renderToPng(await fetchSvgSource(url));
      } catch {
        // Unreachable icon, unreadable file, or no resvg: fall back to the original
        // source, which is what Raycast would have been given anyway.
        file = null;
      }

      cache.set(cacheKey(url), JSON.stringify({ file, timestamp: Date.now() } satisfies CachedRender));
      return file ?? url;
    } finally {
      release();
      inFlight.delete(url);
    }
  })();

  inFlight.set(url, task);
  return task;
};
