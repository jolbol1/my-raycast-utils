import { LaunchProps, Toast, closeMainWindow, showHUD, showToast } from "@raycast/api";
import path from "path";
import { convertSvgToPng, fetchAndCopyPng } from "./utils/fetch";
import { PNG_SCALES, isValidScale, parseScale } from "./utils/png-scales";
import { getSourceSvgPath } from "./utils/svg-selection";

export default async function Command(props: LaunchProps<{ arguments: Arguments.ConvertSvgToPng }>) {
  await closeMainWindow({ clearRootSearch: true });

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Getting SVG file...",
  });

  try {
    const rawScale = props.arguments.scale;
    if (rawScale && !isValidScale(Number.parseInt(rawScale, 10))) {
      toast.style = Toast.Style.Failure;
      toast.title = "Invalid scale";
      toast.message = `Scale must be one of: ${PNG_SCALES.join(", ")}`;
      return;
    }
    const scale = parseScale(rawScale);

    const sourceInfo = await getSourceSvgPath();

    if (!sourceInfo) {
      toast.style = Toast.Style.Failure;
      toast.title = "No SVG file found";
      toast.message = "Please select an SVG file in Finder or copy one to clipboard";
      return;
    }

    if (sourceInfo.error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Invalid file type";
      toast.message = sourceInfo.error;
      return;
    }

    const { path: sourcePath, isFinderFile } = sourceInfo;
    const fileName = path.basename(sourcePath, path.extname(sourcePath));

    toast.title = `Converting SVG to PNG (${scale}x)...`;
    toast.message = "This may take a moment";

    if (isFinderFile) {
      // For Finder files, save next to the original file
      const outputPath = path.join(path.dirname(sourcePath), `${fileName}-${scale}x.png`);
      await convertSvgToPng(sourcePath, outputPath, scale);

      toast.style = Toast.Style.Success;
      toast.title = "SVG converted to PNG!";
      toast.message = `Saved as ${path.basename(outputPath)}`;
      await showHUD(`Saved ${scale}x PNG next to original file`);
    } else {
      // For clipboard files, copy the result back to the clipboard
      await fetchAndCopyPng(sourcePath, fileName, scale);

      toast.style = Toast.Style.Success;
      toast.title = "SVG converted to PNG!";
      toast.message = `Copied ${scale}x PNG to clipboard`;
    }
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to convert SVG";
    toast.message = error instanceof Error ? error.message : String(error);
  }
}
