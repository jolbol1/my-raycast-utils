import { environment, getPreferenceValues, Clipboard, getSelectedFinderItems } from "@raycast/api";
import { execa } from "execa";
import { chmod, readFile, writeFile } from "fs/promises";
import { basename, extname, join } from "path";
import { tmpdir } from "os";
import { fal } from "@fal-ai/client";

/**
 * A unique temp path per call — a memoised one would make two files copied from
 * the clipboard in the same session overwrite each other.
 */
export function getTempFilePath(extension = ".png"): string {
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return join(tmpdir(), `remove-bg-${uniqueSuffix}${extension}`);
}

export async function storeClipboardFileAsTemporaryFile(fileUrl: string) {
  try {
    const sourcePath = decodeURI(fileUrl.replace("file://", ""));
    const fileData = await readFile(sourcePath);

    // Keep the original extension so downstream tools (rsvg-convert, ffmpeg)
    // still see the right file type.
    const extension = extname(sourcePath) || ".png";
    const tempFilePath = getTempFilePath(extension);

    await writeFile(tempFilePath, fileData);

    return tempFilePath;
  } catch (error) {
    console.error("Error copying file:", error);

    throw error;
  }
}

export async function runBackgroundRemoval({ paths }: { paths: string[] }) {
  const command = join(environment.assetsPath, "remove-background");
  await chmod(command, "755");
  const { stdout } = await execa(command, paths);
  return stdout;
}

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".webp": "image/webp",
};

export async function getSourceImagePaths(): Promise<{ paths: string[]; isFinderFile: boolean } | null> {
  // Try Finder files first
  try {
    const selectedFiles = await getSelectedFinderItems();
    if (selectedFiles && selectedFiles.length > 0) {
      // Filter for image files only
      const imagePaths = selectedFiles
        .filter((file) => extname(file.path).toLowerCase() in MIME_TYPES)
        .map((file) => file.path);

      if (imagePaths.length > 0) {
        return { paths: imagePaths, isFinderFile: true };
      }
    }
  } catch {
    // No Finder selection or error getting it, continue to clipboard
  }

  // Try clipboard
  try {
    const clipboardContent = await Clipboard.read();
    if (clipboardContent.file) {
      // If clipboard has a file, store it as temporary file
      const tempPath = await storeClipboardFileAsTemporaryFile(clipboardContent.file);
      return { paths: [tempPath], isFinderFile: false };
    }
  } catch (error) {
    console.error("Error reading clipboard:", error);
  }

  return null;
}

export async function removeBackgroundWithFal(imagePath: string, outputPath?: string, model?: string): Promise<string> {
  const preferences = getPreferenceValues<Preferences.RemoveBackground>();

  if (!preferences.falApiKey) {
    throw new Error("FAL API key not configured");
  }

  // Configure fal client
  fal.config({
    credentials: preferences.falApiKey,
  });

  // Upload image to fal storage
  const imageBuffer = await readFile(imagePath);
  const fileName = basename(imagePath) || "image.png";
  const mimeType = MIME_TYPES[extname(imagePath).toLowerCase()] ?? "image/jpeg";
  const file = new File([imageBuffer], fileName, { type: mimeType });
  const uploadedUrl = await fal.storage.upload(file);
  console.log("Uploaded image URL:", uploadedUrl);

  const selectedModel = model || "fal-ai/bria/background/remove";

  const result = await fal.subscribe(selectedModel, {
    input: {
      image_url: uploadedUrl,
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        update.logs.map((log) => log.message).forEach(console.log);
      }
    },
  });

  // Download the result image BEFORE deleting from fal storage
  const resultData = result.data as { image: { url: string } };
  if (!resultData.image?.url) {
    throw new Error("No image URL in result");
  }

  // Fetch the result image
  const response = await fetch(resultData.image.url);
  if (!response.ok) {
    throw new Error(`Failed to download result image: ${response.statusText}`);
  }

  const resultBuffer = Buffer.from(await response.arrayBuffer());

  // Save to specified path or temporary file
  const resolvedOutputPath =
    outputPath ?? join(tmpdir(), `bg-removed-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`);

  await writeFile(resolvedOutputPath, resultBuffer);

  // Clean up uploaded file from fal storage AFTER downloading result
  try {
    if (result.requestId) {
      const deleteResponse = await fetch(`https://rest.alpha.fal.ai/requests/delete_io/${result.requestId}`, {
        method: "PUT",
        headers: {
          Authorization: `Key ${preferences.falApiKey}`,
        },
      });
      console.log("Delete response status:", deleteResponse.status);
      const deleteResponseText = await deleteResponse.text();
      console.log("Delete response body:", deleteResponseText);
    }
  } catch (error) {
    console.error("Failed to delete uploaded file from fal storage:", error);
    // Don't throw - we still want to return the result
  }

  return resolvedOutputPath;
}

export async function removeBackgroundOffline(imagePath: string): Promise<string> {
  const result = await runBackgroundRemoval({ paths: [imagePath] });
  return result.trim();
}
