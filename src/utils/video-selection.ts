import { Clipboard, getSelectedFinderItems } from "@raycast/api";
import { storeClipboardFileAsTemporaryFile } from "./background-removal";

const MEDIA_EXTENSIONS = [
  // Video
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
  ".flv",
  ".wmv",
  ".m4v",
  ".mpg",
  ".mpeg",
  ".3gp",
  // Audio
  ".mp3",
  ".m4a",
  ".wav",
  ".aac",
  ".flac",
  ".ogg",
  ".wma",
  ".opus",
];

export async function getSourceMediaPath(): Promise<{ path: string; isFinderFile: boolean } | null> {
  // Try Finder files first
  try {
    const selectedFiles = await getSelectedFinderItems();
    if (selectedFiles && selectedFiles.length > 0) {
      // Filter for media files only
      const mediaPaths = selectedFiles
        .filter((file) => MEDIA_EXTENSIONS.some((ext) => file.path.toLowerCase().endsWith(ext)))
        .map((file) => file.path);

      if (mediaPaths.length > 0) {
        // Return first media file found
        return { path: mediaPaths[0], isFinderFile: true };
      }
    }
  } catch (error) {
    // No Finder selection or error getting it, continue to clipboard
  }

  // Try clipboard
  try {
    const clipboardContent = await Clipboard.read();
    if (clipboardContent.file) {
      // If clipboard has a file, store it as temporary file
      const tempPath = await storeClipboardFileAsTemporaryFile(clipboardContent.file);
      return { path: tempPath, isFinderFile: false };
    }
  } catch (error) {
    console.error("Error reading clipboard:", error);
  }

  return null;
}
