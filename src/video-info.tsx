import { Action, ActionPanel, Form, Icon, Keyboard } from "@raycast/api";
import { useEffect, useState } from "react";
import VideoInfoDetail from "./components/video-info-detail";
import { useBinaries } from "./hooks/use-binaries";
import { useVideoInfo } from "./hooks/use-video-info";
import { formatCount, formatDuration } from "./utils/video";
import { readAutoLoadedUrl } from "./utils/video-url";
import { describeYtDlpError } from "./utils/yt-dlp";

interface VideoInfoProps {
  /** Set when the command is pushed from another one. */
  initialUrl?: string;
}

export default function ShowVideoInfo({ initialUrl = "" }: VideoInfoProps) {
  const [url, setUrl] = useState(initialUrl);
  const [urlError, setUrlError] = useState<string>();

  const { ytDlpError } = useBinaries();
  const { info, isLoading, error, revalidate } = useVideoInfo(url);

  useEffect(() => {
    if (initialUrl) return;
    readAutoLoadedUrl().then((loaded) => loaded && setUrl(loaded));
  }, [initialUrl]);

  const friendlyError = error ? describeYtDlpError(error) : undefined;

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {info ? (
              <Action.Push icon={Icon.Eye} title="Show Info" target={<VideoInfoDetail info={info} url={url} />} />
            ) : (
              <Action
                icon={Icon.Eye}
                title="Show Info"
                onAction={() => setUrlError(url.trim() ? "This video could not be read" : "A URL is required")}
              />
            )}
            {(friendlyError?.retryable ?? false) && (
              <Action
                icon={Icon.ArrowClockwise}
                title="Try Again"
                shortcut={Keyboard.Shortcut.Common.Refresh}
                onAction={revalidate}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      {ytDlpError && <Form.Description title="Setup" text={ytDlpError} />}
      <Form.TextField
        id="url"
        title="URL"
        autoFocus
        placeholder="https://www.youtube.com/watch?v=…"
        value={url}
        error={urlError}
        onChange={(value) => {
          setUrlError(undefined);
          setUrl(value);
        }}
      />
      <Form.Description title="Title" text={info?.title ?? friendlyError?.title ?? (isLoading ? "Loading…" : "—")} />
      {info?.channel && <Form.Description title="Channel" text={info.channel} />}
      {info?.duration !== undefined && <Form.Description title="Duration" text={formatDuration(info.duration)} />}
      {info?.view_count !== undefined && <Form.Description title="Views" text={formatCount(info.view_count)} />}
      {friendlyError && <Form.Description title="Problem" text={friendlyError.message} />}
    </Form>
  );
}
