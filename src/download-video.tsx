import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  Keyboard,
  Toast,
  showHUD,
  showInFinder,
  showToast,
} from "@raycast/api";
import path from "path";
import { useEffect, useMemo, useState } from "react";
import { useBinaries } from "./hooks/use-binaries";
import { useVideoInfo } from "./hooks/use-video-info";
import { readAutoLoadedUrl } from "./utils/video-url";
import {
  AUDIO_FORMATS_KEY,
  MP3_FORMAT_ID,
  VIDEO_FORMATS_KEY,
  formatDuration,
  getFormatTitle,
  getFormatValue,
  getFormats,
  hasPlaylist,
  isAudioFormatValue,
  isLikelyUrl,
  isLiveVideo,
  isValidTimecode,
  parseTimecode,
  sanitizeVideoTitle,
  withProtocol,
} from "./utils/video";
import {
  commonArgs,
  describeYtDlpError,
  ffmpegArgs,
  getDownloadPath,
  spawnYtDlp,
  ytDlpCommandLine,
  ytDlpLogs,
} from "./utils/yt-dlp";

interface DownloadVideoProps {
  /** Set when the command is pushed from another one, e.g. from Show Video Info. */
  initialUrl?: string;
}

export default function DownloadVideo({ initialUrl = "" }: DownloadVideoProps) {
  const [url, setUrl] = useState(initialUrl);
  const [urlError, setUrlError] = useState<string>();
  const [format, setFormat] = useState("");
  const [downloadPlaylist, setDownloadPlaylist] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [timeError, setTimeError] = useState<{ start?: string; end?: string }>({});
  const [embedMetadata, setEmbedMetadata] = useState(true);

  const { ytDlpError, isFfmpegMissing } = useBinaries();
  const { info, isLoading, error, revalidate } = useVideoInfo(url);

  useEffect(() => {
    if (initialUrl) return;
    readAutoLoadedUrl().then((loaded) => loaded && setUrl(loaded));
  }, [initialUrl]);

  const formats = useMemo(() => getFormats(info), [info]);
  const allFormats = useMemo(() => Object.values(formats).flat(), [formats]);
  const defaultFormat = formats[VIDEO_FORMATS_KEY][0] ?? formats[AUDIO_FORMATS_KEY][0];

  // A format from a previous URL is meaningless for the current one, so fall back to the best
  // available until the dropdown reports its own choice.
  const selectedFormat = allFormats.some((candidate) => getFormatValue(candidate) === format)
    ? format
    : defaultFormat
      ? getFormatValue(defaultFormat)
      : "";

  const isAudio = isAudioFormatValue(selectedFormat, info);
  const medium = isAudio ? "Audio" : "Video";
  const friendlyError = error ? describeYtDlpError(error) : undefined;
  const isLive = info ? isLiveVideo(info) : false;

  const buildArguments = async () => {
    const downloadPath = getDownloadPath();
    // A playlist needs yt-dlp's own title template, because every entry has a different title.
    const template = downloadPlaylist
      ? "%(playlist_index&{} - |)s%(title).150B (%(id)s).%(ext)s"
      : `${sanitizeVideoTitle(info?.title ?? "video")} (%(id)s).%(ext)s`;

    const args = [
      ...commonArgs(),
      downloadPlaylist ? "--yes-playlist" : "--no-playlist",
      ...(await ffmpegArgs()),
      "-o",
      path.join(downloadPath, template),
    ];

    const [downloadFormat, recodeFormat] = selectedFormat.split("#");

    if (selectedFormat === MP3_FORMAT_ID) {
      args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "0");
    } else {
      args.push("--format", downloadFormat);
      if (!isFfmpegMissing) args.push("--recode-video", recodeFormat);
    }

    if (isAudio && embedMetadata) {
      args.push("--embed-metadata", "--embed-thumbnail");
    }

    if (startTime || endTime) {
      // yt-dlp reads an open end as `inf`, and cutting on keyframes keeps the start watchable.
      args.push("--download-sections", `*${startTime || "0"}-${endTime || "inf"}`, "--force-keyframes-at-cuts");
    }

    return args;
  };

  const validate = () => {
    let valid = true;

    if (!url.trim()) {
      setUrlError("A URL is required");
      valid = false;
    } else if (!isLikelyUrl(url)) {
      setUrlError("This does not look like a URL");
      valid = false;
    } else if (isLive) {
      setUrlError("Live streams are not supported");
      valid = false;
    }

    const times: { start?: string; end?: string } = {};
    if (startTime && !isValidTimecode(startTime)) times.start = "Use HH:MM:SS or MM:SS";
    if (endTime && !isValidTimecode(endTime)) times.end = "Use HH:MM:SS or MM:SS";
    if (!times.start && !times.end && startTime && endTime && parseTimecode(startTime) >= parseTimecode(endTime)) {
      times.end = "The end must come after the start";
    }
    if (!times.end && endTime && info?.duration && parseTimecode(endTime) > info.duration) {
      times.end = `The video is only ${formatDuration(info.duration)} long`;
    }
    setTimeError(times);

    return valid && !times.start && !times.end;
  };

  const download = async () => {
    if (!validate() || !selectedFormat) return;

    const args = await buildArguments().catch((error: unknown) => error as Error);
    if (args instanceof Error) {
      await showToast({ style: Toast.Style.Failure, title: "Could Not Start", message: args.message });
      return;
    }

    const toast = await showToast({ style: Toast.Style.Animated, title: `Downloading ${medium}`, message: "0%" });

    // `--newline` keeps every progress update and the printed file path on their own line,
    // instead of overwriting one carriage-return line that arrives as a single chunk.
    let child;
    try {
      child = await spawnYtDlp([
        ...args,
        "--progress",
        "--newline",
        "--print",
        "after_move:filepath",
        withProtocol(url),
      ]);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could Not Start";
      toast.message = error instanceof Error ? error.message : String(error);
      return;
    }

    let filePath = "";
    // The whole stderr stream is kept so a failure can offer complete logs, while the last
    // ERROR line is the one worth putting in the toast.
    const logLines: string[] = [];
    let lastErrorLine = "";

    child.stdout.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        const progress = Number(/\[download\]\s+(\d+(\.\d+)?)%/.exec(line)?.[1]);
        if (progress) {
          // yt-dlp restarts at 0% for the audio stream and again for the recode, so a drop
          // means it moved on to the next stage rather than went backwards.
          if (progress < Number(toast.message?.replace("%", ""))) toast.title = `Processing ${medium}`;
          toast.message = `${Math.floor(progress)}%`;
        }

        // The only line `--print after_move:filepath` writes is the path of the finished file.
        if (line.startsWith("/")) filePath = line.trim();
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      logLines.push(chunk.toString());
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (line.startsWith("ERROR:")) lastErrorLine = line.trim();
      }
    });

    child.on("close", async (code) => {
      if (code !== 0) {
        const reason = code === null ? "yt-dlp was stopped" : `yt-dlp exited with code ${code}`;
        toast.style = Toast.Style.Failure;
        toast.title = "Download Failed";
        toast.message = lastErrorLine || reason;
        toast.primaryAction = {
          title: "Copy Logs",
          shortcut: { modifiers: ["cmd", "shift"], key: "c" },
          onAction: () => {
            Clipboard.copy(logLines.join("").trim() || reason);
            showHUD("Copied Logs to Clipboard");
          },
        };
        return;
      }

      toast.style = Toast.Style.Success;
      toast.title = `${medium} Downloaded`;
      toast.message = info?.title;

      if (filePath) {
        toast.primaryAction = {
          title: "Show in Finder",
          shortcut: { modifiers: ["cmd", "shift"], key: "o" },
          onAction: () => showInFinder(filePath),
        };
        toast.secondaryAction = {
          title: "Copy File",
          shortcut: { modifiers: ["cmd", "shift"], key: "c" },
          onAction: () => {
            Clipboard.copy({ file: filePath });
            showHUD("Copied File to Clipboard");
          },
        };
      }
    });
  };

  const copyCommand = async () => {
    try {
      const args = await buildArguments();
      await Clipboard.copy(await ytDlpCommandLine([...args, withProtocol(url)]));
      await showHUD("Copied Command to Clipboard");
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could Not Build the Command",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const titleText = info?.title ?? (friendlyError ? friendlyError.title : isLoading ? "Loading…" : "—");

  return (
    <Form
      isLoading={isLoading}
      searchBarAccessory={
        <Form.LinkAccessory
          text="Supported Sites"
          target="https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md"
        />
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.SubmitForm icon={Icon.Download} title={`Download ${medium}`} onSubmit={download} />
            {(friendlyError?.retryable ?? false) && (
              <Action
                icon={Icon.ArrowClockwise}
                title="Try Again"
                shortcut={Keyboard.Shortcut.Common.Refresh}
                onAction={revalidate}
              />
            )}
          </ActionPanel.Section>
          <ActionPanel.Section>
            {info && (
              <Action
                icon={Icon.Terminal}
                title="Copy Command"
                shortcut={Keyboard.Shortcut.Common.Copy}
                onAction={copyCommand}
              />
            )}
            {error && (
              <Action.CopyToClipboard
                icon={Icon.Bug}
                title="Copy Logs"
                content={ytDlpLogs(error)}
                shortcut={{ modifiers: ["cmd", "shift"], key: "l" }}
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
      {isFfmpegMissing && (
        <Form.Description
          title="ffmpeg"
          text="Not found: recoding, merging and MP3 extraction are unavailable. Install it with `mise use -g ffmpeg`."
        />
      )}
      {info && (
        <Form.Dropdown id="format" title="Format" value={selectedFormat} onChange={setFormat}>
          {Object.entries(formats)
            .filter(([, entries]) => entries.length > 0)
            .map(([category, entries]) => (
              <Form.Dropdown.Section title={category} key={category}>
                {entries.map((entry) => (
                  <Form.Dropdown.Item
                    key={getFormatValue(entry)}
                    value={getFormatValue(entry)}
                    title={getFormatTitle(entry)}
                  />
                ))}
              </Form.Dropdown.Section>
            ))}
        </Form.Dropdown>
      )}
      {info && isAudio && (
        <Form.Checkbox
          id="embedMetadata"
          title="Metadata"
          label="Embed title, artist and cover art"
          value={embedMetadata}
          onChange={setEmbedMetadata}
        />
      )}
      {hasPlaylist(url) && (
        <Form.Checkbox
          id="downloadPlaylist"
          title="Playlist"
          label="Download the whole playlist"
          info="This URL is part of a playlist. Leave it unchecked to download only the video above."
          value={downloadPlaylist}
          onChange={setDownloadPlaylist}
        />
      )}
      {info && <Form.Separator />}
      {info && (
        <Form.TextField
          id="startTime"
          title="Start Time"
          placeholder="Optional, e.g. 1:23"
          value={startTime}
          error={timeError.start}
          onChange={(value) => {
            setTimeError((current) => ({ ...current, start: undefined }));
            setStartTime(value);
          }}
        />
      )}
      {info && (
        <Form.TextField
          id="endTime"
          title="End Time"
          placeholder="Optional, e.g. 4:56"
          value={endTime}
          error={timeError.end}
          onChange={(value) => {
            setTimeError((current) => ({ ...current, end: undefined }));
            setEndTime(value);
          }}
        />
      )}
    </Form>
  );
}
