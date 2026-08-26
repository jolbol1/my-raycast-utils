import { Action, ActionPanel, Form, Icon, Keyboard } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import TranscriptDetail from "./components/transcript-detail";
import { useBinaries } from "./hooks/use-binaries";
import { useVideoInfo } from "./hooks/use-video-info";
import { listSubtitleLanguages } from "./utils/transcript";
import { formatDuration, isLikelyUrl } from "./utils/video";
import { readAutoLoadedUrl } from "./utils/video-url";
import { describeYtDlpError } from "./utils/yt-dlp";

interface VideoTranscriptProps {
  /** Set when the command is pushed from another one, e.g. from Show Video Info. */
  initialUrl?: string;
}

export default function VideoTranscript({ initialUrl = "" }: VideoTranscriptProps) {
  const [url, setUrl] = useState(initialUrl);
  const [urlError, setUrlError] = useState<string>();
  const [languageCode, setLanguageCode] = useState("");

  const { ytDlpError } = useBinaries();
  const { info, isLoading, error, revalidate } = useVideoInfo(url);

  useEffect(() => {
    if (initialUrl) return;
    readAutoLoadedUrl().then((loaded) => loaded && setUrl(loaded));
  }, [initialUrl]);

  const languages = useMemo(() => listSubtitleLanguages(info), [info]);
  // The language of a previous video means nothing for this one, so fall back to the best track.
  const selectedLanguage = languages.find((language) => language.code === languageCode) ?? languages[0];
  const friendlyError = error ? describeYtDlpError(error) : undefined;

  const titleText = info?.title ?? (friendlyError ? friendlyError.title : isLoading ? "Loading…" : "—");

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {selectedLanguage && isLikelyUrl(url) ? (
              <Action.Push
                icon={Icon.Text}
                title="Get Transcript"
                target={<TranscriptDetail url={url} language={selectedLanguage} info={info} />}
              />
            ) : (
              <Action
                icon={Icon.Text}
                title="Get Transcript"
                onAction={() => setUrlError(url.trim() ? "No subtitles were found for this URL" : "A URL is required")}
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
      <Form.Description title="Title" text={titleText} />
      {info?.duration !== undefined && <Form.Description title="Duration" text={formatDuration(info.duration)} />}
      {friendlyError && <Form.Description title="Problem" text={friendlyError.message} />}
      {info && languages.length === 0 && (
        <Form.Description title="Subtitles" text="This video publishes no subtitle track." />
      )}
      {languages.length > 0 && (
        <Form.Dropdown
          id="language"
          title="Language"
          value={selectedLanguage?.code ?? ""}
          onChange={setLanguageCode}
          info="Uploaded subtitles read better than automatic ones, when the video has them."
        >
          {languages.map((language) => (
            <Form.Dropdown.Item
              key={language.code}
              value={language.code}
              title={`${language.name}${language.automatic ? " (automatic)" : ""}`}
            />
          ))}
        </Form.Dropdown>
      )}
    </Form>
  );
}
