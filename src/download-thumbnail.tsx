import { Action, ActionPanel, Grid, Icon, Keyboard, Toast, showHUD, showInFinder, showToast } from "@raycast/api";
import { useEffect, useState } from "react";
import { useThumbnails } from "./hooks/use-thumbnails";
import { useVideoInfo } from "./hooks/use-video-info";
import {
  ThumbnailCandidate,
  copyThumbnailToClipboard,
  describeThumbnail,
  downloadThumbnail,
  getYouTubeVideoId,
} from "./utils/thumbnails";
import { VideoInfo, isLikelyUrl } from "./utils/video";
import { readAutoLoadedUrl } from "./utils/video-url";
import { describeYtDlpError } from "./utils/yt-dlp";

interface DownloadThumbnailProps {
  /** Set when the command is pushed from another one, e.g. from Show Video Info. */
  initialUrl?: string;
}

export default function DownloadThumbnail({ initialUrl = "" }: DownloadThumbnailProps) {
  const [url, setUrl] = useState(initialUrl);
  const { info, isLoading, error } = useVideoInfo(url);
  const { thumbnails, variants, areVariantsPartial, isChecking } = useThumbnails(info, url);

  useEffect(() => {
    if (initialUrl) return;
    readAutoLoadedUrl().then((loaded) => loaded && setUrl(loaded));
  }, [initialUrl]);

  // A YouTube URL has predictable thumbnail URLs, so the grid still works when yt-dlp cannot
  // read the video at all (age gate, sign-in, or no yt-dlp installed).
  const isYouTube = Boolean(getYouTubeVideoId(url));
  const friendlyError = error && !isYouTube ? describeYtDlpError(error) : undefined;

  const renderItem = (thumbnail: ThumbnailCandidate) => (
    <Grid.Item
      key={thumbnail.url}
      content={{ source: thumbnail.url }}
      title={thumbnail.label}
      subtitle={describeThumbnail(thumbnail)}
      actions={<ThumbnailActions thumbnail={thumbnail} thumbnails={[...variants, ...thumbnails]} info={info} />}
    />
  );

  return (
    <Grid
      columns={3}
      aspectRatio="16/9"
      fit={Grid.Fit.Fill}
      filtering={false}
      throttle
      isLoading={isLoading || isChecking}
      searchText={url}
      onSearchTextChange={setUrl}
      searchBarPlaceholder="Paste a video URL"
      navigationTitle={info?.title ? `Thumbnails — ${info.title}` : "Download Thumbnail"}
    >
      <Grid.EmptyView
        icon={Icon.Image}
        title={emptyTitle({ url, isLoading, hasError: Boolean(friendlyError) })}
        description={friendlyError?.message ?? "Paste the URL of a video to see every thumbnail it publishes."}
      />
      {variants.length > 0 && (
        <Grid.Section
          title="Thumbnail Test"
          subtitle={
            areVariantsPartial
              ? `${variants.length} so far — YouTube limited the search, reopen to look again`
              : `${variants.length} ${variants.length === 1 ? "cover" : "covers"} in rotation`
          }
        >
          {variants.map(renderItem)}
        </Grid.Section>
      )}
      {variants.length > 0 ? (
        <Grid.Section title="Published Thumbnail">{thumbnails.map(renderItem)}</Grid.Section>
      ) : (
        thumbnails.map(renderItem)
      )}
    </Grid>
  );
}

const emptyTitle = ({ url, isLoading, hasError }: { url: string; isLoading: boolean; hasError: boolean }) => {
  if (hasError) return "Could Not Read This Video";
  if (isLoading) return "Loading Thumbnails…";
  if (url && !isLikelyUrl(url)) return "That Does Not Look Like a URL";
  if (url) return "No Thumbnails Found";
  return "No Video Yet";
};

function ThumbnailActions({
  thumbnail,
  thumbnails,
  info,
}: {
  thumbnail: ThumbnailCandidate;
  thumbnails: ThumbnailCandidate[];
  info?: VideoInfo;
}) {
  const download = async () => {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Downloading thumbnail…" });
    try {
      const filePath = await downloadThumbnail(thumbnail, info);
      toast.style = Toast.Style.Success;
      toast.title = "Thumbnail Downloaded";
      toast.message = filePath;
      toast.primaryAction = {
        title: "Show in Finder",
        shortcut: { modifiers: ["cmd", "shift"], key: "o" },
        onAction: () => showInFinder(filePath),
      };
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Download Failed";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  };

  const downloadAll = async () => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Downloading ${thumbnails.length} thumbnails…`,
    });
    const failures: string[] = [];
    let lastPath = "";

    for (const candidate of thumbnails) {
      try {
        lastPath = await downloadThumbnail(candidate, info);
      } catch {
        failures.push(candidate.label);
      }
    }

    toast.style = failures.length === thumbnails.length ? Toast.Style.Failure : Toast.Style.Success;
    toast.title = failures.length === thumbnails.length ? "Download Failed" : "Thumbnails Downloaded";
    toast.message = failures.length ? `Could not download: ${failures.join(", ")}` : undefined;
    if (lastPath) {
      toast.primaryAction = {
        title: "Show in Finder",
        shortcut: { modifiers: ["cmd", "shift"], key: "o" },
        onAction: () => showInFinder(lastPath),
      };
    }
  };

  const copyImage = async () => {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Copying thumbnail…" });
    try {
      await copyThumbnailToClipboard(thumbnail);
      await toast.hide();
      await showHUD("Copied Thumbnail to Clipboard");
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Copy Failed";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  };

  return (
    <ActionPanel>
      <ActionPanel.Section>
        <Action icon={Icon.Download} title="Download Thumbnail" onAction={download} />
        <Action
          icon={Icon.Clipboard}
          title="Copy Image"
          shortcut={{ modifiers: ["cmd"], key: "c" }}
          onAction={copyImage}
        />
        <Action.CopyToClipboard
          icon={Icon.Link}
          title="Copy Image URL"
          content={thumbnail.url}
          shortcut={Keyboard.Shortcut.Common.Copy}
        />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action.OpenInBrowser
          title="Open Image in Browser"
          url={thumbnail.url}
          shortcut={Keyboard.Shortcut.Common.Open}
        />
        <Action
          icon={Icon.Tray}
          title="Download All Sizes"
          shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
          onAction={downloadAll}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}
