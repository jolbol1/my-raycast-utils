import { execa } from "execa";
import { existsSync, readdirSync } from "fs";
import os from "os";
import path from "path";

/**
 * resvg is a complete SVG renderer, unlike Raycast's built-in image rendering, so
 * rasterising through it is what lets every icon in the library display correctly.
 */

const MISE_INSTALLS = path.join(os.homedir(), ".local/share/mise/installs/resvg");

/**
 * Versioned mise installs, newest first. The mise *shim* also works but costs roughly
 * 15ms extra per call resolving through mise itself, which adds up over a whole grid.
 */
const miseInstalls = (): string[] => {
  try {
    return readdirSync(MISE_INSTALLS)
      .sort()
      .reverse()
      .map((version) => path.join(MISE_INSTALLS, version, "resvg"));
  } catch {
    return [];
  }
};

const candidates = (): string[] => [
  ...miseInstalls(),
  path.join(os.homedir(), ".local/share/mise/shims/resvg"),
  path.join(os.homedir(), ".cargo/bin/resvg"),
  "/opt/homebrew/bin/resvg",
  "/usr/local/bin/resvg",
  "/opt/local/bin/resvg",
];

let resolved: string | undefined;
let lookupFailed = false;

/** Locates the resvg binary, memoised for the lifetime of the command. */
export const findResvg = async (): Promise<string> => {
  if (resolved) {
    return resolved;
  }
  if (lookupFailed) {
    throw new Error(MISSING_MESSAGE);
  }

  for (const candidate of candidates()) {
    if (existsSync(candidate)) {
      resolved = candidate;
      return resolved;
    }
  }

  // Raycast does not inherit an interactive shell's PATH, so this is a last resort
  // rather than the primary lookup.
  try {
    const { stdout } = await execa("which", ["resvg"]);
    const found = stdout.trim();
    if (found) {
      resolved = found;
      return resolved;
    }
  } catch {
    // Fall through to the error below.
  }

  lookupFailed = true;
  throw new Error(MISSING_MESSAGE);
};

const MISSING_MESSAGE = "resvg not found. Install it with: brew install resvg (or mise use -g resvg)";

/** True when resvg is known to be missing, so callers can skip work that would fail. */
export const isResvgMissing = () => lookupFailed;

interface RasterizeOptions {
  /** Output width in pixels; height follows the aspect ratio. */
  width?: number;
  /** Scale factor applied to the SVG's intrinsic size. Ignored when `width` is set. */
  zoom?: number;
}

/** Renders an SVG file to a PNG file and returns the output path. */
export const rasterize = async (svgPath: string, pngPath: string, options: RasterizeOptions): Promise<string> => {
  const binary = await findResvg();

  const args = options.width ? ["--width", String(options.width)] : ["--zoom", String(options.zoom ?? 1)];

  await execa(binary, [...args, svgPath, pngPath]);
  return pngPath;
};
