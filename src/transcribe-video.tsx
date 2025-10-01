import { showToast, Toast, closeMainWindow } from "@raycast/api";
import { getSourceMediaPath } from "./utils/video-selection";
import { runDotfileScript } from "./utils/script-runner";

export default async function Command() {
  await closeMainWindow({ clearRootSearch: true });

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Getting video...",
  });

  try {
    // Get source video
    const sourceInfo = await getSourceMediaPath();

    if (!sourceInfo) {
      toast.style = Toast.Style.Failure;
      toast.title = "No video found";
      toast.message = "Please select a video in Finder or copy one to clipboard";
      return;
    }

    const { path: sourcePath } = sourceInfo;

    toast.title = "Transcribing video...";
    toast.message = "This may take a while";

    // Run transcription script
    await runDotfileScript("transcribe.sh", [sourcePath]);

    toast.style = Toast.Style.Success;
    toast.title = "Video transcribed!";
    toast.message = "";
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to transcribe video";
    toast.message = error instanceof Error ? error.message : String(error);
  }
}
