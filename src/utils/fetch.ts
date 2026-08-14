import { Clipboard, Toast, closeMainWindow, showHUD, showToast } from "@raycast/api";
import { readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { Category, Svg } from "../type";
import { ONE_WEEK_MS, withCache } from "./cache";
import { getPrefixFromSvgUrl, prefixSvgIds } from "./prefix-svg";
import { rasterize } from "./resvg";

export const APP_URL = "https://svgl.app";
export const API_URL = "https://api.svgl.app";
// Because copy react component is using the old API, we need to keep the old API URL.
export const OLD_API_URL = `${APP_URL}/api`;

interface SvrgApiResponse {
  data: string;
}

const isLocalPath = (route: string) => route.startsWith("/");

/** Wraps an action with an animated toast, turning failures into a failure toast. */
const withToast = async (title: string, failureTitle: string, action: () => Promise<void>) => {
  const toast = await showToast({ style: Toast.Style.Animated, title });
  try {
    await action();
    await toast.hide();
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: failureTitle,
      message: error instanceof Error ? error.message : undefined,
    });
  }
};

export const fetchSvgs = async () => {
  return withCache("svgl_svgs", async () => {
    const svgsResponse = await fetch(API_URL);
    if (!svgsResponse.ok) {
      throw new Error(`Error ${svgsResponse.status}, please try again later.`);
    }
    return (await svgsResponse.json()) as Svg[];
  });
};

export const fetchCategories = async () => {
  return withCache("svgl_categories", async () => {
    const categoriesResponse = await fetch(`${API_URL}/categories`);
    if (!categoriesResponse.ok) {
      throw new Error(`Error ${categoriesResponse.status}, please try again later.`);
    }
    return (await categoriesResponse.json()) as Category[];
  });
};

export const fetchSvg = async (url: string) => {
  // Local icons live on disk and are never cached — reading them is cheap and
  // caching would serve stale content after the file is edited.
  if (isLocalPath(url)) {
    const svg = await readFile(url, "utf-8");
    return prefixSvgIds(svg, getPrefixFromSvgUrl(url));
  }

  return withCache(
    `svgl_svg_${url}`,
    async () => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Error ${res.status}, please try again later.`);
      }
      const svg = await res.text();
      return prefixSvgIds(svg, getPrefixFromSvgUrl(url));
    },
    ONE_WEEK_MS,
  );
};

const fetchReactComponent = async (url: string, name: string, tsx: boolean) => {
  const svg = await fetchSvg(url);
  return withCache(
    `svgl_svgr_${url}_${tsx}`,
    async () => {
      const res = await fetch(`${OLD_API_URL}/svgs/svgr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: svg, name, typescript: tsx }),
      });

      if (!res.ok) {
        throw new Error(`${res.statusText}`);
      }

      const { data } = (await res.json()) as SvrgApiResponse;
      return data;
    },
    ONE_WEEK_MS,
  );
};

export const fetchAndCopySvg = async (url: string, showContent: string) => {
  await withToast("Fetching svg file", "Failed to fetch svg", async () => {
    const svg = await fetchSvg(url);
    await Clipboard.copy(svg);
    await showHUD(showContent);
    await closeMainWindow();
  });
};

export const fetchAndCopySvgFile = async (url: string, showContent: string, fileName: string) => {
  await withToast("Fetching svg file", "Failed to fetch svg", async () => {
    let filePath: string;

    if (isLocalPath(url)) {
      filePath = url;
    } else {
      const svg = await fetchSvg(url);
      filePath = path.join(os.tmpdir(), `${sanitizeFileName(fileName)}.svg`);
      await writeFile(filePath, svg, "utf-8");
    }

    await Clipboard.copy({ file: filePath });
    await showHUD(showContent);
    await closeMainWindow();
  });
};

export const fetchAndCopyReactComponent = async (url: string, name: string, tsx: boolean) => {
  await withToast("Fetching React component", "Failed to fetch react component", async () => {
    const reactComponent = await fetchReactComponent(url, name, tsx);
    await Clipboard.copy(reactComponent);
    await showHUD("Copied React component to clipboard");
    await closeMainWindow();
  });
};

/** Keeps generated temp file names free of path separators and shell-hostile characters. */
export const sanitizeFileName = (fileName: string) => fileName.replace(/[^a-zA-Z0-9-_]/g, "_");

/** Rasterises an SVG (local path or remote URL) to a PNG on disk and returns its path. */
export const convertSvgToPng = async (url: string, outputPath: string, scale: number) => {
  let svgPath: string;

  if (isLocalPath(url)) {
    svgPath = url;
  } else {
    const svg = await fetchSvg(url);
    svgPath = path.join(os.tmpdir(), `${path.basename(outputPath, ".png")}-temp.svg`);
    await writeFile(svgPath, svg, "utf-8");
  }

  return rasterize(svgPath, outputPath, { zoom: scale });
};

export const fetchAndCopyPng = async (url: string, fileName: string, scale: number) => {
  await withToast(`Converting SVG to PNG (${scale}x)`, "Failed to convert to PNG", async () => {
    const pngPath = path.join(os.tmpdir(), `${sanitizeFileName(fileName)}-${scale}x.png`);
    await convertSvgToPng(url, pngPath, scale);

    await Clipboard.copy({ file: pngPath });
    await showHUD(`Copied ${scale}x PNG to clipboard`);
    await closeMainWindow();
  });
};
