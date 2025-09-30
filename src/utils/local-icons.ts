import { readdirSync, statSync, existsSync } from "fs";
import path from "path";
import os from "os";
import { Svg } from "../type";

export const loadLocalSvgs = (localIconsPath?: string): Svg[] => {
  const localSvgs: Svg[] = [];

  // If no path provided or path is empty, return empty array
  if (!localIconsPath || localIconsPath.trim() === "") {
    return localSvgs;
  }

  // Check if the directory exists
  if (!existsSync(localIconsPath)) {
    return localSvgs;
  }

  try {
    const folders = readdirSync(localIconsPath);
    let id = 10000; // Start with a high ID to avoid conflicts with API SVGs

    folders.forEach((folder) => {
      const folderPath = path.join(localIconsPath, folder);
      const stat = statSync(folderPath);

      if (!stat.isDirectory()) {
        return;
      }

      // Check for variant files
      const lightPath = path.join(folderPath, "light.svg");
      const darkPath = path.join(folderPath, "dark.svg");
      const wordmarkLightPath = path.join(folderPath, "wordmark-light.svg");
      const wordmarkDarkPath = path.join(folderPath, "wordmark-dark.svg");

      const hasLight = existsSync(lightPath);
      const hasDark = existsSync(darkPath);
      const hasWordmarkLight = existsSync(wordmarkLightPath);
      const hasWordmarkDark = existsSync(wordmarkDarkPath);

      // Determine route structure
      let route: string | { light: string; dark: string };
      if (hasLight && hasDark) {
        route = {
          light: lightPath,
          dark: darkPath,
        };
      } else if (hasLight) {
        route = lightPath;
      } else if (hasDark) {
        route = darkPath;
      } else {
        // No valid SVG files found, skip this folder
        return;
      }

      // Determine wordmark structure
      let wordmark: string | { light: string; dark: string } | undefined;
      if (hasWordmarkLight && hasWordmarkDark) {
        wordmark = {
          light: wordmarkLightPath,
          dark: wordmarkDarkPath,
        };
      } else if (hasWordmarkLight) {
        wordmark = wordmarkLightPath;
      } else if (hasWordmarkDark) {
        wordmark = wordmarkDarkPath;
      }

      const svg: Svg = {
        id,
        title: folder,
        category: "Custom",
        route,
        wordmark: wordmark as any,
        brandUrl: "",
        url: "",
      };

      localSvgs.push(svg);
      id++;
    });
  } catch (error) {
    console.error("Error loading local SVGs:", error);
  }

  return localSvgs;
};
