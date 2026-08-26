import { Action, ActionPanel, Detail, Icon, Keyboard, Toast, showInFinder, showToast } from "@raycast/api";
import { writeFile } from "fs/promises";
import path from "path";
import { useEffect, useState } from "react";
import { SubtitleLanguage, Transcript, fetchTranscript, toSrt, toTimestamped } from "../utils/transcript";
import { VideoInfo, formatDuration, sanitizeVideoTitle, withProtocol } from "../utils/video";
import { describeYtDlpError, getDownloadPath, isAbortError } from "../utils/yt-dlp";

interface TranscriptDetailProps {
  url: string;
  language: SubtitleLanguage;
  info?: VideoInfo;
}

export default function TranscriptDetail({ url, language, info }: TranscriptDetailProps) {
  const [transcript, setTranscript] = useState<Transcript>();
  const [error, setError] = useState<Error>();
  const [isLoading, setIsLoading] = useState(true);
  const [withTimestamps, setWithTimestamps] = useState(false);

  useEffect(() => {
    const abort = new AbortController();

    (async () => {
      try {
        setTranscript(await fetchTranscript(withProtocol(url), language.code, abort.signal));
      } catch (loadError) {
        if (abort.signal.aborted || isAbortError(loadError)) return;
        setError(loadError instanceof Error ? loadError : new Error(String(loadError)));
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => abort.abort();
  }, [url, language.code]);

  const plainText = withTimestamps ? toTimestamped(transcript?.cues ?? []) : (transcript?.text ?? "");

  const save = async (extension: "txt" | "srt") => {
    if (!transcript) return;
    const fileName = `${sanitizeVideoTitle(info?.title ?? "transcript")} - ${transcript.language}.${extension}`;
    const filePath = path.join(getDownloadPath(), fileName);

    try {
      await writeFile(filePath, extension === "srt" ? toSrt(transcript.cues) : `${plainText}\n`, "utf-8");
      await showToast({
        style: Toast.Style.Success,
        title: `Saved ${extension.toUpperCase()}`,
        message: filePath,
        primaryAction: {
          title: "Show in Finder",
          shortcut: { modifiers: ["cmd", "shift"], key: "o" },
          onAction: () => showInFinder(filePath),
        },
      });
    } catch (saveError) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could Not Save the Transcript",
        message: saveError instanceof Error ? saveError.message : String(saveError),
      });
    }
  };

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle={info?.title ? `Transcript — ${info.title}` : "Transcript"}
      markdown={buildMarkdown({ isLoading, error, transcript, withTimestamps, plainText, info })}
      metadata={
        transcript && (
          <Detail.Metadata>
            <Detail.Metadata.Label title="Language" text={`${language.name} (${transcript.language})`} />
            <Detail.Metadata.Label title="Source" text={language.automatic ? "Automatic captions" : "Uploaded"} />
            <Detail.Metadata.Label title="Lines" text={String(transcript.cues.length)} />
            <Detail.Metadata.Label title="Words" text={String(transcript.text.split(/\s+/).filter(Boolean).length)} />
            {info?.duration !== undefined && (
              <Detail.Metadata.Label title="Duration" text={formatDuration(info.duration)} />
            )}
          </Detail.Metadata>
        )
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.CopyToClipboard title="Copy Transcript" content={plainText} />
            <Action
              icon={Icon.Clock}
              title={withTimestamps ? "Hide Timestamps" : "Show Timestamps"}
              shortcut={{ modifiers: ["cmd"], key: "t" }}
              onAction={() => setWithTimestamps((current) => !current)}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              icon={Icon.SaveDocument}
              title="Save Text File"
              shortcut={Keyboard.Shortcut.Common.Save}
              onAction={() => save("txt")}
            />
            <Action
              icon={Icon.SaveDocument}
              title="Save Subtitle File"
              shortcut={Keyboard.Shortcut.Common.Duplicate}
              onAction={() => save("srt")}
            />
            <Action.OpenInBrowser url={withProtocol(url)} shortcut={Keyboard.Shortcut.Common.Open} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

const buildMarkdown = ({
  isLoading,
  error,
  transcript,
  withTimestamps,
  plainText,
  info,
}: {
  isLoading: boolean;
  error?: Error;
  transcript?: Transcript;
  withTimestamps: boolean;
  plainText: string;
  info?: VideoInfo;
}) => {
  if (isLoading) return "Reading the subtitles…";

  if (error) {
    const friendly = describeYtDlpError(error);
    return `# ${friendly.title}\n\n${friendly.message}`;
  }

  if (!transcript || transcript.cues.length === 0) {
    return "# No Subtitles\n\nThis video has no subtitle track in that language.";
  }

  const heading = info?.title ? `# ${info.title}\n\n` : "";
  // Timestamped lines have to stay on their own line, so they are given hard breaks.
  return heading + (withTimestamps ? plainText.split("\n").join("\n\n") : plainText);
};
