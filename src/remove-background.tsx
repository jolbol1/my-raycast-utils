import {
  showToast,
  Toast,
  Clipboard,
  getPreferenceValues,
  closeMainWindow,
  confirmAlert,
  LaunchProps,
} from "@raycast/api";
import { getSourceImagePaths, removeBackgroundWithFal, removeBackgroundOffline } from "./utils/background-removal";

export default async function Command(props: LaunchProps<{ arguments: Arguments.RemoveBackground }>) {
  await closeMainWindow({ clearRootSearch: true });

  const preferences = getPreferenceValues<Preferences.RemoveBackground>();
  const { model: argModel, customModel } = props.arguments;

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Getting image...",
  });

  try {
    // Get source images
    const sourceInfo = await getSourceImagePaths();

    if (!sourceInfo) {
      toast.style = Toast.Style.Failure;
      toast.title = "No image found";
      toast.message = "Please select an image in Finder or copy one to clipboard";
      return;
    }

    const { paths: sourcePaths, isFinderFile } = sourceInfo;

    // Determine which model to use
    // Priority: customModel > argModel > defaultModel preference > fallback default
    const selectedModel = customModel || argModel || preferences.defaultModel || "fal-ai/bria/background/remove";

    // Check API key if using fal-ai
    if (selectedModel !== "offline" && !preferences.falApiKey) {
      toast.style = Toast.Style.Failure;
      toast.title = "FAL API key not configured";
      toast.message = "Please configure your FAL API key in preferences";
      return;
    }

    const totalFiles = sourcePaths.length;
    const resultPaths: string[] = [];

    // Process each file
    for (let i = 0; i < totalFiles; i++) {
      const sourcePath = sourcePaths[i];
      const fileNum = i + 1;

      toast.title = `Processing ${fileNum} of ${totalFiles}...`;
      toast.message = "";

      // Calculate output path for fal-ai (only for Finder files)
      let outputPath: string | undefined;
      if (isFinderFile) {
        // Save next to original with -removedbg suffix
        const lastDotIndex = sourcePath.lastIndexOf(".");
        if (lastDotIndex !== -1) {
          const basePath = sourcePath.substring(0, lastDotIndex);
          outputPath = `${basePath}-removedbg.png`;
        } else {
          outputPath = `${sourcePath}-removedbg.png`;
        }
      }

      let resultPath: string;

      try {
        // Use offline or fal-ai based on selected model
        if (selectedModel === "offline") {
          resultPath = await removeBackgroundOffline(sourcePath);

          // For clipboard images, the offline script outputs a file with -background-removed suffix
          if (!isFinderFile) {
            const lastDotIndex = resultPath.lastIndexOf(".");
            if (lastDotIndex !== -1) {
              const basePath = resultPath.substring(0, lastDotIndex);
              const extension = resultPath.substring(lastDotIndex);
              resultPath = `${basePath}-background-removed${extension}`;
            } else {
              resultPath = `${resultPath}-background-removed`;
            }
          }
        } else {
          // Use fal-ai
          try {
            resultPath = await removeBackgroundWithFal(sourcePath, outputPath, selectedModel);
          } catch (error) {
            console.error("FAL API failed for file:", sourcePath, error);

            // Only ask once on the first failure
            if (i === 0) {
              toast.style = Toast.Style.Failure;
              toast.title = "FAL API failed";
              toast.message = error instanceof Error ? error.message : String(error);

              const useOffline = await confirmAlert({
                title: "FAL API Failed",
                message: "Would you like to try offline background removal instead for all files?",
                primaryAction: {
                  title: "Use Offline Mode",
                },
                dismissAction: {
                  title: "Cancel",
                },
              });

              if (useOffline) {
                toast.style = Toast.Style.Animated;
                toast.title = `Processing ${fileNum} of ${totalFiles}...`;
                toast.message = "Using offline mode";
                resultPath = await removeBackgroundOffline(sourcePath);
              } else {
                throw new Error("Cancelled by user");
              }
            } else {
              throw error;
            }
          }
        }

        resultPaths.push(resultPath);
      } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.title = `Failed on file ${fileNum} of ${totalFiles}`;
        toast.message = error instanceof Error ? error.message : String(error);
        return;
      }
    }

    // Copy last result to clipboard (or all results if multiple)
    if (resultPaths.length === 1) {
      await Clipboard.copy({ file: resultPaths[0] });
    } else {
      await Clipboard.copy({ file: resultPaths[resultPaths.length - 1] });
    }

    toast.style = Toast.Style.Success;
    toast.title = `Processed ${totalFiles} ${totalFiles === 1 ? "image" : "images"}!`;
    toast.message = selectedModel === "offline" ? "Using offline mode" : `Using ${selectedModel}`;
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to remove background";
    toast.message = error instanceof Error ? error.message : String(error);
  }
}
