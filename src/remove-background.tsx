import {
  showToast,
  Toast,
  Clipboard,
  getPreferenceValues,
  closeMainWindow,
  confirmAlert,
  LaunchProps,
} from "@raycast/api";
import {
  getSourceImagePath,
  removeBackgroundWithFal,
  removeBackgroundOffline,
} from "./utils/background-removal";

interface Preferences {
  falApiKey?: string;
  defaultModel?: string;
}

interface Arguments {
  model?: string;
  customModel?: string;
}

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  await closeMainWindow({ clearRootSearch: true });

  const preferences = getPreferenceValues<Preferences>();
  const { model: argModel, customModel } = props.arguments;

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Getting image...",
  });

  try {
    // Get source image
    const sourceInfo = await getSourceImagePath();

    if (!sourceInfo) {
      toast.style = Toast.Style.Failure;
      toast.title = "No image found";
      toast.message = "Please select an image in Finder or copy one to clipboard";
      return;
    }

    const { path: sourcePath, isFinderFile } = sourceInfo;

    // Calculate output path for fal-ai (only for Finder files)
    let outputPath: string | undefined;
    if (isFinderFile) {
      // Save next to original with -removedbg suffix
      const lastDotIndex = sourcePath.lastIndexOf(".");
      if (lastDotIndex !== -1) {
        const basePath = sourcePath.substring(0, lastDotIndex);
        const extension = sourcePath.substring(lastDotIndex);
        outputPath = `${basePath}-removedbg${extension}`;
      } else {
        outputPath = `${sourcePath}-removedbg`;
      }
    }

    // Determine which model to use
    // Priority: customModel > argModel > defaultModel preference > fallback default
    const selectedModel = customModel || argModel || preferences.defaultModel || "fal-ai/bria/background/remove";

    toast.title = "Removing background...";

    let resultPath: string;

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

      toast.style = Toast.Style.Success;
      toast.title = "Background removed!";
      toast.message = "Using offline mode";
    } else {
      // Use fal-ai
      if (!preferences.falApiKey) {
        toast.style = Toast.Style.Failure;
        toast.title = "FAL API key not configured";
        toast.message = "Please configure your FAL API key in preferences";
        return;
      }

      try {
        resultPath = await removeBackgroundWithFal(sourcePath, outputPath, selectedModel);
        toast.style = Toast.Style.Success;
        toast.title = "Background removed!";
        toast.message = `Using ${selectedModel}`;
      } catch (error) {
        console.error("FAL API failed, falling back to offline:", error);
        toast.style = Toast.Style.Failure;
        toast.title = "FAL API failed";
        toast.message = error instanceof Error ? error.message : String(error);

        // Ask user if they want to use offline mode
        const useOffline = await confirmAlert({
          title: "FAL API Failed",
          message: "Would you like to try offline background removal instead?",
          primaryAction: {
            title: "Use Offline Mode",
          },
          dismissAction: {
            title: "Cancel",
          },
        });

        if (useOffline) {
          toast.style = Toast.Style.Animated;
          toast.title = "Using offline mode...";
          toast.message = "";

          try {
            resultPath = await removeBackgroundOffline(sourcePath);
            toast.style = Toast.Style.Success;
            toast.title = "Background removed!";
            toast.message = "Using offline mode";
          } catch (offlineError) {
            throw new Error(`Offline mode failed: ${offlineError}`);
          }
        } else {
          return;
        }
      }
    }

    // Copy result to clipboard
    await Clipboard.copy({ file: resultPath });
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to remove background";
    toast.message = error instanceof Error ? error.message : String(error);
  }
}
