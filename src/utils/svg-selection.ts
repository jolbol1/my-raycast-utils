import { Clipboard, getSelectedFinderItems } from "@raycast/api";
import { storeClipboardFileAsTemporaryFile } from "./background-removal";
import path from "path";

const SVG_EXTENSIONS = [".svg"];

export async function getSourceSvgPath(): Promise<{ path: string; isFinderFile: boolean; error?: string } | null> {
  // Try Finder files first
  try {
    const selectedFiles = await getSelectedFinderItems();
    if (selectedFiles && selectedFiles.length > 0) {
      // Check if any files are selected
      const allFilePaths = selectedFiles.map((file) => file.path);
      const svgPaths = selectedFiles
        .filter((file) => SVG_EXTENSIONS.some((ext) => file.path.toLowerCase().endsWith(ext)))
        .map((file) => file.path);

      if (svgPaths.length > 0) {
        // Return first SVG file found
        return { path: svgPaths[0], isFinderFile: true };
      } else {
        // Files were selected but none are SVG
        const fileExtensions = allFilePaths.map((p) => path.extname(p).toLowerCase()).join(", ");
        return {
          path: "",
          isFinderFile: false,
          error: `Selected files are not SVG format. Found: ${fileExtensions}. Please select an SVG file.`,
        };
      }
    }
  } catch {
    // No Finder selection or error getting it, continue to clipboard
  }

  // Try clipboard
  try {
    const clipboardContent = await Clipboard.read();
    if (clipboardContent.file) {
      // Check if clipboard file is SVG
      const fileName = clipboardContent.file.split("/").pop() || "";
      const isSvg = SVG_EXTENSIONS.some((ext) => fileName.toLowerCase().endsWith(ext));

      if (!isSvg) {
        return {
          path: "",
          isFinderFile: false,
          error: `Clipboard file is not an SVG. File: ${fileName}. Please copy an SVG file.`,
        };
      }

      // If clipboard has a file, store it as temporary file
      const tempPath = await storeClipboardFileAsTemporaryFile(clipboardContent.file);
      return { path: tempPath, isFinderFile: false };
    }
  } catch (error) {
    console.error("Error reading clipboard:", error);
  }

  return null;
}
