import { Clipboard, Toast, closeMainWindow, showHUD, showToast } from "@raycast/api";
import fetch from "node-fetch";
import { Category, Svg } from "../type";
import { ONE_WEEK_MS, withCache } from "./cache";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import os from "os";
import { getPrefixFromSvgUrl, prefixSvgIds } from "./prefix-svg";
import { execa } from "execa";

export const APP_URL = "https://svgl.app";
export const API_URL = "https://api.svgl.app";
// Because copy react component is using the old API, we need to keep the old API URL.
export const OLD_API_URL = `${APP_URL}/api`;

interface SvrgApiResponse {
  data: string;
}

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
  // Handle local file paths (absolute paths starting with /)
  if (url.startsWith("/")) {
    const svg = readFileSync(url, "utf-8");
    return prefixSvgIds(svg, getPrefixFromSvgUrl(url));
  }

  return withCache(
    `svgl_svg_${url}`,
    async () => {
      const res = await fetch(url);
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
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Fetching svg file",
  });
  try {
    const svg = await fetchSvg(url);
    await toast.hide();
    Clipboard.copy(svg);
    showHUD(showContent);
    closeMainWindow();
  } catch (error) {
    if (error instanceof Error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to fetch svg",
        message: error.message,
      });
    } else {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to fetch svg",
      });
    }
  }
};

export const fetchAndCopySvgFile = async (url: string, showContent: string, fileName: string) => {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Fetching svg file",
  });
  try {
    let filePath: string;

    // Handle local file paths
    if (url.startsWith("/")) {
      filePath = url;
    } else {
      const svg = await fetchSvg(url);
      filePath = path.join(os.tmpdir(), `${fileName}.svg`);
      writeFileSync(filePath, svg, "utf-8");
    }

    await toast.hide();
    Clipboard.copy({
      file: filePath,
    });
    showHUD(showContent);
    closeMainWindow();
  } catch (error) {
    if (error instanceof Error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to fetch svg",
        message: error.message,
      });
    } else {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to fetch svg",
      });
    }
  }
};

export const fetchAndCopyReactComponent = async (url: string, name: string, tsx: boolean) => {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Fetching React component",
  });

  try {
    const reactComponent = await fetchReactComponent(url, name, tsx);
    await toast.hide();
    Clipboard.copy(reactComponent);
    showHUD(`Copied React component to clipboard`);
    closeMainWindow();
  } catch (error) {
    if (error instanceof Error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to fetch react component",
        message: error.message,
      });
    } else {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to fetch react component",
      });
    }
    return;
  }
};

export const findRsvgConvert = async (): Promise<string> => {
  // Common installation paths for rsvg-convert
  const commonPaths = [
    "/opt/homebrew/bin/rsvg-convert", // Homebrew on Apple Silicon
    "/usr/local/bin/rsvg-convert", // Homebrew on Intel Mac
    "/opt/local/bin/rsvg-convert", // MacPorts
  ];

  // Check common paths first
  for (const binPath of commonPaths) {
    try {
      await execa(binPath, ["--version"]);
      return binPath;
    } catch {
      // Continue to next path
    }
  }

  // Fallback to using which command to find it in PATH
  try {
    const { stdout } = await execa("which", ["rsvg-convert"]);
    return stdout.trim();
  } catch {
    throw new Error("rsvg-convert not found. Please install librsvg: brew install librsvg");
  }
};

export const fetchAndCopyPng = async (url: string, fileName: string, scale: number) => {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: `Converting SVG to PNG (${scale}x)`,
  });
  try {
    // Sanitize fileName to avoid issues with special characters
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9-_]/g, "_");
    const pngPath = path.join(os.tmpdir(), `${sanitizedFileName}-${scale}x.png`);

    let svgPath: string;

    // Handle local file paths
    if (url.startsWith("/")) {
      svgPath = url;
    } else {
      // For remote URLs, fetch and save to temp
      const svg = await fetchSvg(url);
      svgPath = path.join(os.tmpdir(), `${sanitizedFileName}-temp.svg`);
      writeFileSync(svgPath, svg, "utf-8");
    }

    // Find rsvg-convert binary
    const rsvgConvertPath = await findRsvgConvert();

    // Use rsvg-convert to scale SVG and convert to PNG
    // This scales the SVG first, then rasterizes it to PNG
    await execa(rsvgConvertPath, ["--zoom", scale.toString(), "--output", pngPath, svgPath]);

    await toast.hide();
    Clipboard.copy({
      file: pngPath,
    });
    showHUD(`Copied ${scale}x PNG to clipboard`);
    closeMainWindow();
  } catch (error) {
    if (error instanceof Error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to convert to PNG",
        message: error.message,
      });
    } else {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to convert to PNG",
      });
    }
  }
};
