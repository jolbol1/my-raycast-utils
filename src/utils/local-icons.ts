import { readdirSync, existsSync } from "fs";
import path from "path";
import { Svg } from "../type";
import { expandPath } from "./expand-path";

export const LOCAL_CATEGORY = "Custom";

/**
 * Local icons get their own ID space so they never collide with svgl.app IDs
 * (which are small sequential integers).
 */
const LOCAL_ID_OFFSET = 1_000_000;

/**
 * Derives a stable ID from the icon title, so pinned/recent icons survive
 * files being added to or removed from the icons folder.
 */
const stableId = (title: string): number => {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0;
  }
  return LOCAL_ID_OFFSET + Math.abs(hash);
};

const isSvg = (fileName: string) => fileName.toLowerCase().endsWith(".svg");

type Variants = {
  light?: string;
  dark?: string;
  wordmarkLight?: string;
  wordmarkDark?: string;
};

const toRoute = (light?: string, dark?: string): string | { light: string; dark: string } | undefined => {
  if (light && dark) return { light, dark };
  return light ?? dark;
};

const buildSvg = (title: string, variants: Variants): Svg | undefined => {
  const route = toRoute(variants.light, variants.dark);
  if (!route) {
    return undefined;
  }

  return {
    id: stableId(title),
    title,
    category: LOCAL_CATEGORY,
    route,
    wordmark: toRoute(variants.wordmarkLight, variants.wordmarkDark),
    brandUrl: "",
    url: "",
  };
};

/**
 * A folder named after the icon, holding any of:
 * light.svg, dark.svg, wordmark-light.svg, wordmark-dark.svg.
 * A folder with a single unnamed .svg (e.g. `icon.svg`) is also accepted.
 */
const readIconFolder = (folderPath: string, title: string): Svg | undefined => {
  let entries: string[];
  try {
    entries = readdirSync(folderPath).filter(isSvg);
  } catch {
    return undefined;
  }

  const find = (name: string) => {
    const match = entries.find((entry) => entry.toLowerCase() === name);
    return match ? path.join(folderPath, match) : undefined;
  };

  const variants: Variants = {
    light: find("light.svg"),
    dark: find("dark.svg"),
    wordmarkLight: find("wordmark-light.svg"),
    wordmarkDark: find("wordmark-dark.svg"),
  };

  // Fall back to the first .svg in the folder when no named variant exists.
  if (!variants.light && !variants.dark && entries.length > 0) {
    variants.light = path.join(folderPath, entries[0]);
  }

  return buildSvg(title, variants);
};

/**
 * Flat files directly inside the icons folder, e.g.
 * `figma.svg`, `figma-dark.svg`, `figma-wordmark.svg`, `figma-wordmark-dark.svg`.
 */
const readFlatFiles = (dir: string, fileNames: string[]): Svg[] => {
  const grouped = new Map<string, Variants>();
  const titles = new Map<string, string>();

  const variantOf = (base: string): { title: string; key: keyof Variants } => {
    const lower = base.toLowerCase();
    if (lower.endsWith("-wordmark-dark")) return { title: base.slice(0, -14), key: "wordmarkDark" };
    if (lower.endsWith("-wordmark-light")) return { title: base.slice(0, -15), key: "wordmarkLight" };
    if (lower.endsWith("-wordmark")) return { title: base.slice(0, -9), key: "wordmarkLight" };
    if (lower.endsWith("-dark")) return { title: base.slice(0, -5), key: "dark" };
    if (lower.endsWith("-light")) return { title: base.slice(0, -6), key: "light" };
    return { title: base, key: "light" };
  };

  for (const fileName of fileNames) {
    const base = path.basename(fileName, path.extname(fileName));
    const { title, key } = variantOf(base);
    if (!title) {
      continue;
    }

    const groupKey = title.toLowerCase();
    const variants = grouped.get(groupKey) ?? {};
    variants[key] = path.join(dir, fileName);
    grouped.set(groupKey, variants);
    // Prefer the plain `name.svg` spelling for the displayed title.
    if (!titles.has(groupKey) || key === "light") {
      titles.set(groupKey, title);
    }
  }

  const svgs: Svg[] = [];
  for (const [groupKey, variants] of grouped) {
    const svg = buildSvg(titles.get(groupKey) ?? groupKey, variants);
    if (svg) {
      svgs.push(svg);
    }
  }
  return svgs;
};

export interface LocalSvgsResult {
  svgs: Svg[];
  /** Set when the configured path could not be read, so the UI can surface it. */
  error?: string;
}

export const loadLocalSvgs = (localIconsPath?: string): LocalSvgsResult => {
  if (!localIconsPath || localIconsPath.trim() === "") {
    return { svgs: [] };
  }

  const dir = expandPath(localIconsPath);

  if (!existsSync(dir)) {
    return { svgs: [], error: `Local icons folder not found: ${dir}` };
  }

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    const folderSvgs = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => readIconFolder(path.join(dir, entry.name), entry.name))
      .filter((svg): svg is Svg => svg !== undefined);

    const flatFiles = entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && isSvg(entry.name))
      .map((entry) => entry.name);

    const svgs = [...folderSvgs, ...readFlatFiles(dir, flatFiles)];

    // A duplicate title (e.g. `figma/` and `figma.svg`) would produce the same
    // stable ID, which breaks pinning — keep the first one only.
    const seen = new Set<number>();
    const unique = svgs.filter((svg) => (seen.has(svg.id) ? false : (seen.add(svg.id), true)));

    return {
      svgs: unique.sort((a, b) => a.title.localeCompare(b.title)),
      error: unique.length === 0 ? `No SVGs found in ${dir}` : undefined,
    };
  } catch (error) {
    return { svgs: [], error: error instanceof Error ? error.message : String(error) };
  }
};
