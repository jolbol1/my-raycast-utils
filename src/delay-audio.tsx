import { showToast, Toast, closeMainWindow, LaunchProps } from "@raycast/api";
import { getSourceMediaPath } from "./utils/video-selection";
import { runDotfileScript } from "./utils/script-runner";

interface Arguments {
  delay?: string;
}

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  await closeMainWindow({ clearRootSearch: true });

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Getting media file...",
  });

  try {
    // Get source media file
    const sourceInfo = await getSourceMediaPath();

    if (!sourceInfo) {
      toast.style = Toast.Style.Failure;
      toast.title = "No media file found";
      toast.message = "Please select a video or audio file in Finder or copy one to clipboard";
      return;
    }

    const { path: sourcePath } = sourceInfo;
    const delay = props.arguments.delay || "50";

    toast.title = "Delaying audio...";
    toast.message = `Applying ${delay}ms delay`;

    // Run delay script
    await runDotfileScript("delay-audio.sh", [sourcePath, "--delay", delay]);

    toast.style = Toast.Style.Success;
    toast.title = "Audio delayed!";
    toast.message = `Applied ${delay}ms delay`;
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to delay audio";
    toast.message = error instanceof Error ? error.message : String(error);
  }
}
