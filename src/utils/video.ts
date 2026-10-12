import { commonArgs, runYtDlp } from "./yt-dlp";

export interface VideoFormat {
  format_id: string;
  format_note?: string;
  vcodec?: string;
  acodec?: string;
  ext: string;
  protocol?: string;
  filesize?: number;
  filesize_approx?: number;
  resolution?: string;
  width?: number;
  height?: number;
  fps?: number;
  tbr?: number | null;
}

export interface VideoThumbnail {
  id?: string;
  url: string;
  width?: number;
  height?: number;
  preference?: number;
}

export interface VideoChapter {
  title: string;
  start_time: number;
  end_time?: number;
}

export interface SubtitleTrack {
  ext?: string;
  url?: string;
  name?: string;
}

export interface VideoInfo {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  live_status?: string;
  is_live?: boolean;
  was_live?: boolean;
  uploader?: string;
  channel?: string;
  channel_url?: string;
  uploader_url?: string;
  channel_follower_count?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  upload_date?: string;
  webpage_url?: string;
  original_url?: string;
  extractor_key?: string;
  availability?: string;
  age_limit?: number;
  thumbnail?: string;
  thumbnails?: VideoThumbnail[];
  chapters?: VideoChapter[] | null;
  tags?: string[];
  categories?: string[];
  formats: VideoFormat[];
  subtitles?: Record<string, SubtitleTrack[]>;
  automatic_captions?: Record<string, SubtitleTrack[]>;
}

/** Metadata for a single video. `--no-playlist` keeps the output to one JSON object. */
export const fetchVideoInfo = async (url: string, signal?: AbortSignal): Promise<VideoInfo> => {
  const stdout = await runYtDlp(
    [...commonArgs({ throttle: true }), "--no-playlist", "--dump-json", "--format-sort=res,ext,tbr", url],
    { signal },
  );

  // A stray warning can share stdout with the JSON, so take the first line that parses.
  const line = stdout.split("\n").find((candidate) => candidate.trim().startsWith("{"));
  if (!line) {
    throw new Error("yt-dlp returned no metadata for this URL.");
  }

  return JSON.parse(line) as VideoInfo;
};

export const isLiveVideo = (info: VideoInfo) =>
  info.is_live === true || (info.live_status !== undefined && info.live_status !== "not_live");

/** Whether a URL points into a playlist, so the form can offer to pull the whole list. */
export const hasPlaylist = (url: string) => {
  try {
    return new URL(url).searchParams.has("list");
  } catch {
    return /[?&]list=/.test(url);
  }
};

/** A permissive check: enough to avoid querying yt-dlp for half-typed text. */
export const isLikelyUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/|$|\?|#|:)/i.test(trimmed);
};

export const withProtocol = (url: string) => (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);

const hasCodec = ({ vcodec, acodec }: VideoFormat) => ({
  hasVcodec: Boolean(vcodec) && vcodec !== "none",
  hasAcodec: Boolean(acodec) && acodec !== "none",
});

export const MP3_FORMAT_ID = "bestaudio#mp3";

const mp3Format: VideoFormat = {
  format_id: "bestaudio",
  ext: "mp3",
  protocol: "https",
  resolution: "audio only",
  vcodec: "none",
  acodec: "mp3",
  tbr: null,
};

export const VIDEO_FORMATS_KEY = "Video";
export const AUDIO_FORMATS_KEY = "Audio Only";

/** The format list split into video and audio-only, best first, with an MP3 pseudo-format on top. */
export const getFormats = (info?: VideoInfo) => {
  const videoWithAudio: VideoFormat[] = [];
  const audioOnly: VideoFormat[] = [];

  if (!info) return { [VIDEO_FORMATS_KEY]: videoWithAudio, [AUDIO_FORMATS_KEY]: audioOnly };

  audioOnly.push(mp3Format);

  // yt-dlp sorts worst-first, and `--format-sort` was already applied when the metadata was read.
  for (const format of (info.formats ?? []).slice().reverse()) {
    const { hasAcodec, hasVcodec } = hasCodec(format);
    if (hasVcodec) videoWithAudio.push(format);
    else if (hasAcodec) audioOnly.push(format);
  }

  return { [VIDEO_FORMATS_KEY]: videoWithAudio, [AUDIO_FORMATS_KEY]: audioOnly };
};

/**
 * The dropdown value of a format: `<selector>#<target extension>`. A video-only stream gets
 * `+bestaudio` so yt-dlp merges a sound track into it.
 */
export const getFormatValue = (format: VideoFormat) => {
  const { hasAcodec } = hasCodec(format);
  return `${format.format_id}${hasAcodec ? "" : "+bestaudio"}#${format.ext}`;
};

export const isAudioFormatValue = (value: string, info?: VideoInfo) => {
  if (value === MP3_FORMAT_ID) return true;
  const format = Object.values(getFormats(info))
    .flat()
    .find((candidate) => getFormatValue(candidate) === value);
  return format?.vcodec === "none";
};

export const formatFilesize = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

export const getFormatTitle = (format: VideoFormat) =>
  [
    format.resolution ?? (format.height ? `${format.width}x${format.height}` : ""),
    format.ext,
    format.fps && format.fps > 30 ? `${Math.round(format.fps)}fps` : "",
    format.tbr ? `${Math.floor(format.tbr)} kbps` : "",
    formatFilesize(format.filesize ?? format.filesize_approx),
  ]
    .filter(Boolean)
    .join(" | ");

/** Seconds as `M:SS`, or `H:MM:SS` for anything an hour or longer. */
export const formatDuration = (seconds?: number) => {
  if (seconds === undefined || Number.isNaN(seconds)) return "";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const padded = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${padded(minutes)}:${padded(secs)}` : `${minutes}:${padded(secs)}`;
};

export const parseTimecode = (input: string) => {
  const parts = input.trim().split(":");
  if (parts.some((part) => part === "" || !/^\d+(\.\d+)?$/.test(part))) throw new Error("Invalid timecode");

  const numbers = parts.map(Number);
  if (numbers.length === 1) return numbers[0];
  if (numbers.length === 2) return numbers[0] * 60 + numbers[1];
  if (numbers.length === 3) return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
  throw new Error("Invalid timecode");
};

export const isValidTimecode = (input: string) => {
  try {
    parseTimecode(input);
    return true;
  } catch {
    return false;
  }
};

export const formatCount = (count?: number) => {
  if (count === undefined) return "";
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}K`;
  if (count < 1_000_000_000) return `${(count / 1_000_000).toFixed(count < 10_000_000 ? 1 : 0)}M`;
  return `${(count / 1_000_000_000).toFixed(1)}B`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** yt-dlp reports upload dates as `YYYYMMDD`. */
export const formatUploadDate = (date?: string) => {
  if (!date || !/^\d{8}$/.test(date)) return "";
  const month = Number(date.slice(4, 6));
  return `${Number(date.slice(6, 8))} ${MONTHS[month - 1] ?? ""} ${date.slice(0, 4)}`.trim();
};

/** A title that is safe to use as a macOS filename, and short enough to survive the filesystem. */
export const sanitizeVideoTitle = (title: string) => {
  const maxLength = 150;

  let safe = Array.from(title.trim())
    .filter((char) => char.charCodeAt(0) >= 32)
    .join("")
    .replaceAll(":", "")
    .replaceAll("/", "-")
    .replace(/\s+/g, " ");

  if (safe.length > maxLength) {
    safe = safe.slice(0, maxLength);
    const lastSpace = safe.lastIndexOf(" ");
    if (lastSpace > 0) safe = safe.slice(0, lastSpace);
  }

  return safe.trim() || "video";
};
