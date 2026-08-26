import { Clipboard } from "@raycast/api";
import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { AbVariant } from "./ab-thumbnails";
import { VideoInfo, formatFilesize, sanitizeVideoTitle } from "./video";
import { getDownloadPath } from "./yt-dlp";

export interface ThumbnailCandidate {
  /** Stable key and filename suffix, e.g. `maxresdefault` or a yt-dlp thumbnail id. */
  id: string;
  label: string;
  url: string;
  width?: number;
  height?: number;
  /** Byte size from the availability check, when the server reported one. */
  bytes?: number;
  source: "yt-dlp" | "youtube" | "ab-test";
}

/** The video id of a YouTube watch, share, shorts, embed or live URL. */
export const getYouTubeVideoId = (url: string): string | undefined => {
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");

    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return isYouTubeId(id) ? id : undefined;
    }

    if (host !== "youtube.com" && host !== "youtube-nocookie.com" && host !== "music.youtube.com") return undefined;

    const fromQuery = parsed.searchParams.get("v");
    if (fromQuery && isYouTubeId(fromQuery)) return fromQuery;

    const [section, id] = parsed.pathname.split("/").filter(Boolean);
    if (["shorts", "embed", "live", "v"].includes(section) && isYouTubeId(id)) return id;

    return undefined;
  } catch {
    return undefined;
  }
};

const isYouTubeId = (value?: string) => Boolean(value) && /^[\w-]{11}$/.test(value as string);

// The fixed set YouTube serves for every video. yt-dlp usually reports most of them, but not
// always the largest ones, and it never reports them for a URL it could not fully extract.
const YOUTUBE_THUMBNAILS: { name: string; label: string; width: number; height: number }[] = [
  { name: "maxresdefault", label: "Max Resolution", width: 1280, height: 720 },
  { name: "sddefault", label: "Standard Definition", width: 640, height: 480 },
  { name: "hqdefault", label: "High Quality", width: 480, height: 360 },
  { name: "mqdefault", label: "Medium Quality", width: 320, height: 180 },
  { name: "default", label: "Default", width: 120, height: 90 },
  { name: "hq1", label: "Frame 1 (HQ)", width: 480, height: 360 },
  { name: "hq2", label: "Frame 2 (HQ)", width: 480, height: 360 },
  { name: "hq3", label: "Frame 3 (HQ)", width: 480, height: 360 },
];

const youtubeCandidates = (videoId: string): ThumbnailCandidate[] =>
  YOUTUBE_THUMBNAILS.map(({ name, label, width, height }) => ({
    id: name,
    label,
    url: `https://i.ytimg.com/vi/${videoId}/${name}.jpg`,
    width,
    height,
    source: "youtube" as const,
  }));

// yt-dlp leaves width and height out for most YouTube thumbnails, and the grid needs them to
// sort and to describe each tile. Every name YouTube serves has a fixed size.
const YOUTUBE_NAME_SIZES: { pattern: RegExp; width: number; height: number }[] = [
  { pattern: /^maxres(default|[1-3])$/, width: 1280, height: 720 },
  { pattern: /^hq720$/, width: 1280, height: 720 },
  { pattern: /^sd(default|[1-3])$/, width: 640, height: 480 },
  { pattern: /^hq(default|[1-3])$/, width: 480, height: 360 },
  { pattern: /^mq(default|[1-3])$/, width: 320, height: 180 },
  { pattern: /^(default|[1-3])$/, width: 120, height: 90 },
];

// Every field here comes from yt-dlp, so a URL it could not parse must not break the whole list.
const urlPath = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

const thumbnailName = (url: string) => path.basename(urlPath(url)).replace(/\.[a-z0-9]+$/i, "");

const youtubeNameSize = (name: string) => YOUTUBE_NAME_SIZES.find((entry) => entry.pattern.test(name));

// The same picture is published as both JPEG and WebP, under the same name.
const imageFormat = (url: string) => {
  const extension = path.extname(urlPath(url)).toLowerCase();
  return extension === ".webp" ? "WebP" : extension === ".png" ? "PNG" : "";
};

// YouTube publishes one cover plus three frames grabbed from the video, at several sizes.
const FRAME_QUALITIES: Record<string, string> = { maxres: "Max", sd: "SD", hq: "HQ", mq: "MQ", "": "Low" };

const nameLabel = (name: string): { base: string; quality?: string } => {
  const known = YOUTUBE_THUMBNAILS.find((entry) => entry.name === name);
  if (known) return { base: known.label };
  if (name === "hq720") return { base: "720p" };

  const frame = /^(maxres|sd|hq|mq)?([1-3])$/.exec(name);
  if (frame) return { base: `Frame ${frame[2]}`, quality: FRAME_QUALITIES[frame[1] ?? ""] };

  return { base: name || "Thumbnail" };
};

const labelFor = (url: string) => {
  const { base, quality } = nameLabel(thumbnailName(url));
  const qualifiers = [quality, imageFormat(url)].filter(Boolean);
  return qualifiers.length > 0 ? `${base} (${qualifiers.join(", ")})` : base;
};

const area = (candidate: ThumbnailCandidate) => (candidate.width ?? 0) * (candidate.height ?? 0);

/** Everything yt-dlp knows about, plus YouTube's fixed set, deduplicated and largest first. */
export const collectThumbnails = (info: VideoInfo | undefined, url: string): ThumbnailCandidate[] => {
  if (!info && !getYouTubeVideoId(url)) return [];

  const byUrl = new Map<string, ThumbnailCandidate>();

  for (const thumbnail of info?.thumbnails ?? []) {
    if (!thumbnail.url) continue;

    const name = thumbnailName(thumbnail.url);
    const inferred = youtubeNameSize(name);
    const width = thumbnail.width ?? inferred?.width;
    const height = thumbnail.height ?? inferred?.height;

    byUrl.set(stripQuery(thumbnail.url), {
      // The name reads far better in a filename than yt-dlp's numeric thumbnail id.
      id: name || thumbnail.id || "thumbnail",
      label: labelFor(thumbnail.url),
      url: thumbnail.url,
      width,
      height,
      source: "yt-dlp",
    });
  }

  const videoId = getYouTubeVideoId(info?.webpage_url ?? info?.original_url ?? url) ?? getYouTubeVideoId(url);
  if (videoId) {
    for (const candidate of youtubeCandidates(videoId)) {
      const existing = byUrl.get(stripQuery(candidate.url));
      // Keep yt-dlp's entry, but take the label and the sizes it left out.
      if (existing) {
        byUrl.set(stripQuery(candidate.url), {
          ...existing,
          width: existing.width ?? candidate.width,
          height: existing.height ?? candidate.height,
        });
      } else {
        byUrl.set(stripQuery(candidate.url), candidate);
      }
    }
  }

  return [...byUrl.values()].sort((a, b) => area(b) - area(a));
};

// YouTube signs some thumbnail URLs, so the query string must be ignored when deduplicating.
const stripQuery = (url: string) => url.split("?")[0];

/**
 * Whether the image really exists, and how big it is. YouTube answers 404 for a `maxresdefault`
 * that was never generated, and yt-dlp lists thumbnails it has not checked.
 */
export const checkThumbnail = async (
  candidate: ThumbnailCandidate,
): Promise<{ available: boolean; bytes?: number }> => {
  const read = (response: Response) => {
    const length = Number(response.headers.get("content-length"));
    return { available: true, bytes: Number.isFinite(length) && length > 0 ? length : undefined };
  };

  try {
    const head = await fetch(candidate.url, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
    if (head.ok) return read(head);
    // Some CDNs refuse HEAD but serve the image happily, so only a real 404/410 is a miss.
    if (head.status === 404 || head.status === 410) return { available: false };
  } catch {
    // Fall through to the ranged GET below.
  }

  try {
    const ranged = await fetch(candidate.url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(10_000),
    });
    // A 206 reports only the single requested byte, so its content-length is not the file size.
    if (ranged.ok) return ranged.status === 206 ? { available: true } : read(ranged);
    return { available: false };
  } catch {
    return { available: false };
  }
};

// The content type wins over the path: YouTube serves WebP bytes from a `.jpg` URL when it
// negotiates the format, which is what every A/B variant URL does.
const extensionFor = (candidate: ThumbnailCandidate, contentType?: string | null) => {
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("jpeg")) return ".jpg";
  return path.extname(urlPath(candidate.url)).toLowerCase() || ".jpg";
};

const fetchThumbnail = async (candidate: ThumbnailCandidate) => {
  const response = await fetch(candidate.url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`The server answered ${response.status} for this thumbnail.`);
  }
  return {
    data: Buffer.from(await response.arrayBuffer()),
    extension: extensionFor(candidate, response.headers.get("content-type")),
  };
};

export const thumbnailFileName = (candidate: ThumbnailCandidate, info: VideoInfo | undefined, extension: string) => {
  const title = sanitizeVideoTitle(info?.title ?? "thumbnail");
  return `${title} - ${candidate.id}${extension}`;
};

/** Saves the image into the download folder and answers where it landed. */
export const downloadThumbnail = async (candidate: ThumbnailCandidate, info?: VideoInfo) => {
  const { data, extension } = await fetchThumbnail(candidate);
  const filePath = path.join(getDownloadPath(), thumbnailFileName(candidate, info, extension));
  await writeFile(filePath, data);
  return filePath;
};

/** Copies the image itself (not its URL) to the clipboard, through a temporary file. */
export const copyThumbnailToClipboard = async (candidate: ThumbnailCandidate) => {
  const { data, extension } = await fetchThumbnail(candidate);
  const filePath = path.join(tmpdir(), `thumbnail-${Date.now()}-${candidate.id}${extension}`);
  await writeFile(filePath, data);
  await Clipboard.copy({ file: filePath });
  return filePath;
};

export const describeThumbnail = (candidate: ThumbnailCandidate) =>
  [
    candidate.width && candidate.height ? `${candidate.width} × ${candidate.height}` : "",
    formatFilesize(candidate.bytes),
  ]
    .filter(Boolean)
    .join(" · ");

/** The tested covers as grid candidates, kept apart from the sizes of the published one. */
export const toVariantCandidates = (variants: AbVariant[]): ThumbnailCandidate[] =>
  variants.map((variant) => ({
    id: `ab-variant-${variant.index}`,
    label: `Variant ${variant.index}`,
    url: variant.url,
    source: "ab-test" as const,
  }));
