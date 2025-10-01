import { environment, getPreferenceValues, Clipboard, getSelectedFinderItems } from "@raycast/api";
import { exec } from "child_process";
import { chmod, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { fal } from "@fal-ai/client";

interface Preferences {
  falApiKey?: string;
  defaultModel?: string;
}

let _tempFilePath: string;

export function getTempFilePath(): string {
  if (_tempFilePath) {
    return _tempFilePath;
  }

  const tempDir = tmpdir();
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  _tempFilePath = join(tempDir, `remove-bg-${uniqueSuffix}.png`);

  return _tempFilePath;
}

export async function storeClipboardImageAsTemporaryFile(imageUrl: string) {
  try {
    const sourcePath = decodeURI(imageUrl.replace("file://", ""));
    const imageData = await readFile(sourcePath);

    const tempFilePath = getTempFilePath();

    await writeFile(tempFilePath, imageData);

    return tempFilePath;
  } catch (error) {
    console.error("Error copying image file:", error);

    throw error;
  }
}

export async function runBackgroundRemoval({ paths }: { paths: string[] }) {
  const command = join(environment.assetsPath, "remove-background");
  await chmod(command, "755");
  const output = await new Promise<string>((resolve, reject) => {
    exec(`${command} ${paths.map((x) => JSON.stringify(x)).join(" ")}`, (err, stdout, stderr) => {
      if (err) {
        reject(stdout + " " + stderr);
      }
      resolve(stdout);
    });
  });

  return output;
}

export async function getSourceImagePath(): Promise<{ path: string; isFinderFile: boolean } | null> {
  // Try Finder file first
  try {
    const selectedFiles = await getSelectedFinderItems();
    if (selectedFiles && selectedFiles.length > 0) {
      const firstFile = selectedFiles[0];
      // Check if it's an image file
      const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"];
      if (imageExtensions.some((ext) => firstFile.path.toLowerCase().endsWith(ext))) {
        return { path: firstFile.path, isFinderFile: true };
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
      const tempPath = await storeClipboardImageAsTemporaryFile(clipboardContent.file);
      return { path: tempPath, isFinderFile: false };
    }
  } catch (error) {
    console.error("Error reading clipboard:", error);
  }

  return null;
}

export async function removeBackgroundWithFal(
  imagePath: string,
  outputPath?: string,
  model?: string,
): Promise<string> {
  const preferences = getPreferenceValues<Preferences>();

  if (!preferences.falApiKey) {
    throw new Error("FAL API key not configured");
  }

  // Configure fal client
  fal.config({
    credentials: preferences.falApiKey,
  });

  // Upload image to fal storage
  const imageBuffer = await readFile(imagePath);
  const fileName = imagePath.split("/").pop() || "image.png";
  const mimeType = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
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
  if (!outputPath) {
    const tempDir = tmpdir();
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    outputPath = join(tempDir, `bg-removed-${uniqueSuffix}.png`);
  }

  await writeFile(outputPath, resultBuffer);

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

  return outputPath;
}

export async function removeBackgroundOffline(imagePath: string): Promise<string> {
  const result = await runBackgroundRemoval({ paths: [imagePath] });
  return result.trim();
}
