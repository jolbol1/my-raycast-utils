import { showToast, Toast, closeMainWindow, LaunchProps, showHUD } from "@raycast/api";
import { getSourceSvgPath } from "./utils/svg-selection";
import { fetchAndCopyPng } from "./utils/fetch";
import path from "path";
import { execa } from "execa";
import { findRsvgConvert } from "./utils/fetch";

interface Arguments {
  scale?: string;
}

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  await closeMainWindow({ clearRootSearch: true });

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Getting SVG file...",
  });

  try {
    // Get source SVG file
    const sourceInfo = await getSourceSvgPath();

    if (!sourceInfo) {
      toast.style = Toast.Style.Failure;
      toast.title = "No SVG file found";
      toast.message = "Please select an SVG file in Finder or copy one to clipboard";
      return;
    }

    // Check for error in file selection
    if (sourceInfo.error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Invalid file type";
      toast.message = sourceInfo.error;
      return;
    }

    const { path: sourcePath, isFinderFile } = sourceInfo;
    const scale = parseInt(props.arguments.scale || "4");

    // Validate scale
    const validScales = [1, 2, 4, 8, 16, 32, 64];
    if (!validScales.includes(scale)) {
      toast.style = Toast.Style.Failure;
      toast.title = "Invalid scale";
      toast.message = `Scale must be one of: ${validScales.join(", ")}`;
      return;
    }

    // Get filename without extension for the output
    const fileName = path.basename(sourcePath, path.extname(sourcePath));

    toast.title = `Converting SVG to PNG (${scale}x)...`;
    toast.message = "This may take a moment";

    if (isFinderFile) {
      // For Finder files, save next to the original file
      const outputPath = path.join(path.dirname(sourcePath), `${fileName}-${scale}x.png`);
      
      try {
        // Find rsvg-convert binary
        const rsvgConvertPath = await findRsvgConvert();
        
        // Use rsvg-convert to scale SVG and convert to PNG
        await execa(rsvgConvertPath, ["--zoom", scale.toString(), "--output", outputPath, sourcePath]);
        
        toast.style = Toast.Style.Success;
        toast.title = `SVG converted to PNG!`;
        toast.message = `Saved as ${path.basename(outputPath)}`;
        showHUD(`Saved ${scale}x PNG next to original file`);
      } catch (error) {
        throw new Error(`Failed to convert SVG: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      // For clipboard files, use the existing function that copies to clipboard
      await fetchAndCopyPng(sourcePath, fileName, scale);
      
      toast.style = Toast.Style.Success;
      toast.title = `SVG converted to PNG!`;
      toast.message = `Copied ${scale}x PNG to clipboard`;
    }
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to convert SVG";
    toast.message = error instanceof Error ? error.message : String(error);
  }
}
