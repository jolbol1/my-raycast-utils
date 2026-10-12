import { mkdtemp, readFile, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { VideoInfo, formatDuration } from "./video";
import { commonArgs, ffmpegArgs, runYtDlp } from "./yt-dlp";

export interface SubtitleLanguage {
  /** The yt-dlp language code, e.g. `en`, `en-GB`, `es-orig`. */
  code: string;
  name: string;
  /** True when only a machine transcription is available for this language. */
  automatic: boolean;
}

export interface TranscriptCue {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  language: string;
  cues: TranscriptCue[];
  /** The cues joined into readable prose, with the auto-caption repetition removed. */
  text: string;
}

const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], { type: "language" });

const describeLanguage = (code: string, tracks: { name?: string }[]) => {
  const named = tracks.find((track) => track.name)?.name;
  if (named) return named;

  // YouTube suffixes the language the video was actually spoken in with `-orig`; every other
  // automatic track is a machine translation of it.
  const isOriginal = code.endsWith("-orig");
  const base = code.replace(/-orig$/, "");
  let name = base;
  try {
    name = LANGUAGE_NAMES.of(base) ?? base;
  } catch {
    name = base;
  }

  return isOriginal ? `${name} (original)` : name;
};

/** Manual tracks first, then automatic ones, with English floated to the top of each group. */
export const listSubtitleLanguages = (info?: VideoInfo): SubtitleLanguage[] => {
  if (!info) return [];

  const languages = new Map<string, SubtitleLanguage>();

  for (const [code, tracks] of Object.entries(info.automatic_captions ?? {})) {
    languages.set(code, { code, name: describeLanguage(code, tracks ?? []), automatic: true });
  }
  // A manual track wins over the automatic one for the same language.
  for (const [code, tracks] of Object.entries(info.subtitles ?? {})) {
    languages.set(code, { code, name: describeLanguage(code, tracks ?? []), automatic: false });
  }

  const rank = (language: SubtitleLanguage) => (language.automatic ? 2 : 0) + (language.code.startsWith("en") ? 0 : 1);

  return [...languages.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
};

/** Downloads the subtitle track and turns it into cues plus readable prose. */
export const fetchTranscript = async (url: string, language: string, signal?: AbortSignal): Promise<Transcript> => {
  const workingDir = await mkdtemp(path.join(tmpdir(), "raycast-transcript-"));

  try {
    await runYtDlp(
      [
        ...commonArgs({ throttle: true }),
        ...(await ffmpegArgs()),
        "--no-playlist",
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        language,
        "--convert-subs",
        "srt",
        "-o",
        path.join(workingDir, "%(id)s.%(ext)s"),
        url,
      ],
      { timeoutMs: 1000 * 120, signal },
    );

    // yt-dlp writes `<id>.<lang>.srt`, and the language it picked can be a regional or
    // `-orig` variant of the one that was asked for.
    const files = (await readdir(workingDir)).filter((file) => file.endsWith(".srt"));
    const wanted = language.toLowerCase();
    const languageOf = (file: string) => file.slice(0, -".srt".length).split(".").pop()?.toLowerCase() ?? "";
    const subtitleFile =
      files.find((file) => languageOf(file) === wanted) ??
      files.find((file) => languageOf(file).startsWith(`${wanted.split("-")[0]}-`)) ??
      files[0];

    if (!subtitleFile) {
      throw new Error(`No ${language} subtitles are available for this video.`);
    }

    const cues = parseSrt(await readFile(path.join(workingDir, subtitleFile), "utf-8"));

    return { language: languageOf(subtitleFile) || language, cues, text: toProse(cues) };
  } finally {
    await rm(workingDir, { recursive: true, force: true });
  }
};

const TIMECODE = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;

const toSeconds = (hours: string, minutes: string, seconds: string, millis: string) =>
  Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;

export const parseSrt = (content: string): TranscriptCue[] => {
  const cues: TranscriptCue[] = [];

  for (const block of content.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n").filter((line) => line.trim() !== "");
    const timeIndex = lines.findIndex((line) => TIMECODE.test(line));
    if (timeIndex === -1) continue;

    const match = TIMECODE.exec(lines[timeIndex]);
    if (!match) continue;

    const text = cleanCueText(lines.slice(timeIndex + 1).join(" "));
    if (!text) continue;

    cues.push({
      start: toSeconds(match[1], match[2], match[3], match[4]),
      end: toSeconds(match[5], match[6], match[7], match[8]),
      text,
    });
  }

  return cues;
};

const cleanCueText = (text: string) =>
  text
    .replace(/<[^>]+>/g, "") // inline karaoke timing tags
    .replace(/\{[^}]+\}/g, "") // SSA style overrides
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Auto captions roll: each cue repeats the tail of the one before it. Keeping only the new
 * words of every cue turns the track back into something readable, without losing the times.
 */
export const dedupeCues = (cues: TranscriptCue[]): TranscriptCue[] => {
  const result: TranscriptCue[] = [];
  let previous = "";

  for (const cue of cues) {
    if (!cue.text || cue.text === previous) continue;

    if (previous && cue.text.startsWith(previous)) {
      const addition = cue.text.slice(previous.length).trim();
      if (addition) result.push({ ...cue, text: addition });
    } else if (!previous.includes(cue.text)) {
      result.push(cue);
    }

    previous = cue.text;
  }

  return result;
};

export const toProse = (cues: TranscriptCue[]) =>
  dedupeCues(cues)
    .map((cue) => cue.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/** The cues as `[0:12] line` rows, for reading along with the video. */
export const toTimestamped = (cues: TranscriptCue[]) =>
  dedupeCues(cues)
    .map((cue) => `[${formatDuration(cue.start)}] ${cue.text}`)
    .join("\n");

export const toSrt = (cues: TranscriptCue[]) =>
  cues
    .map((cue, index) => `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}`)
    .join("\n\n")
    .concat("\n");

const srtTime = (seconds: number) => {
  const millis = Math.round((seconds % 1) * 1000);
  const total = Math.floor(seconds);
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)},${pad(millis, 3)}`;
};
