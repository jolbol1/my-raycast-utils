import { getPreferenceValues } from "@raycast/api";
import { spawn } from "child_process";
import { execa, ExecaError } from "execa";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { expandPath } from "./expand-path";

export type BinaryName = "yt-dlp" | "ffmpeg";

/** Raised when a binary is nowhere to be found, so the UI can explain how to fix it. */
export class BinaryNotFoundError extends Error {
  constructor(readonly binary: BinaryName) {
    super(
      `${binary} was not found. Install it with \`mise use -g ${binary}\` or \`brew install ${binary}\`, ` +
        `or set its path in the extension settings.`,
    );
    this.name = "BinaryNotFoundError";
  }
}

// Raycast starts commands with a bare PATH, so the binary has to be located by hand.
// The mise shims directory is checked too, because that is where a `mise use -g` tool lands.
const candidatePaths = (binary: BinaryName) => [
  path.join(os.homedir(), ".local", "bin", binary),
  path.join(os.homedir(), ".local", "share", "mise", "shims", binary),
  `/opt/homebrew/bin/${binary}`,
  `/usr/local/bin/${binary}`,
  `/usr/bin/${binary}`,
];

// Every call goes through the login shell: a mise shim re-executes `mise`, which has to be
// on PATH for the shim to work at all. Profile output is thrown away so it can never end up
// in the JSON we parse.
const SHELL = "/bin/zsh";
const SHELL_PRELUDE = '{ source ~/.zprofile; source ~/.zshrc; } >/dev/null 2>&1; "$0" "$@"';

const DEFAULT_TIMEOUT_MS = 1000 * 90;

const resolved = new Map<BinaryName, string>();

const configuredPath = (binary: BinaryName) => {
  const { ytDlpPath, ffmpegPath } = getPreferenceValues<Preferences>();
  const value = (binary === "yt-dlp" ? ytDlpPath : ffmpegPath)?.trim();
  return value ? expandPath(value) : undefined;
};

/** Asks the login shell where the binary lives, ignoring shell functions and aliases. */
const lookupInShell = async (binary: BinaryName) => {
  try {
    const { stdout } = await execa(
      SHELL,
      ["-c", `{ source ~/.zprofile; source ~/.zshrc; } >/dev/null 2>&1; which -p ${binary}`],
      { timeout: 15000 },
    );
    const candidate = stdout.trim().split("\n").pop()?.trim();
    return candidate && candidate.startsWith("/") && existsSync(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
};

export const resolveBinary = async (binary: BinaryName): Promise<string> => {
  const cached = resolved.get(binary);
  if (cached) return cached;

  const configured = configuredPath(binary);
  if (configured) {
    if (!existsSync(configured)) {
      throw new Error(`No ${binary} binary at ${configured}. Update the path in the extension settings.`);
    }
    resolved.set(binary, configured);
    return configured;
  }

  const candidate = candidatePaths(binary).find((binPath) => existsSync(binPath)) ?? (await lookupInShell(binary));
  if (!candidate) {
    throw new BinaryNotFoundError(binary);
  }

  resolved.set(binary, candidate);
  return candidate;
};

/** ffmpeg is only needed for merging, recoding and audio extraction, so a miss is not fatal. */
export const resolveOptionalBinary = async (binary: BinaryName): Promise<string | undefined> => {
  try {
    return await resolveBinary(binary);
  } catch {
    return undefined;
  }
};

/**
 * `--ffmpeg-location` args, or nothing when ffmpeg is missing. The directory is passed rather
 * than the binary so yt-dlp finds ffprobe next to it.
 */
export const ffmpegArgs = async (): Promise<string[]> => {
  const ffmpeg = await resolveOptionalBinary("ffmpeg");
  return ffmpeg ? ["--ffmpeg-location", path.dirname(ffmpeg)] : [];
};

/**
 * Arguments applied to every yt-dlp run, so the network and extractor behaviour stays the same
 * across metadata lookups, downloads and subtitle fetches.
 *
 * `throttle` is for metadata-only calls: retrying the extractor and spacing out API requests
 * helps there, but on a download `--sleep-requests` would sleep before every media segment.
 */
export const commonArgs = ({ throttle = false }: { throttle?: boolean } = {}): string[] => {
  const { forceIpv4, cookiesFromBrowser } = getPreferenceValues<Preferences>();
  const args: string[] = [];

  if (forceIpv4) args.push("--force-ipv4");
  if (cookiesFromBrowser && cookiesFromBrowser !== "none") {
    args.push("--cookies-from-browser", cookiesFromBrowser);
  }
  if (throttle) {
    args.push("--extractor-retries", "3");
    args.push("--sleep-requests", "1");
  }

  return args;
};

interface RunOptions {
  timeoutMs?: number;
  /** Aborts the run, so a superseded metadata lookup does not keep a yt-dlp process alive. */
  signal?: AbortSignal;
}

export const runYtDlp = async (args: string[], { timeoutMs = DEFAULT_TIMEOUT_MS, signal }: RunOptions = {}) => {
  const bin = await resolveBinary("yt-dlp");

  const { stdout } = await execa(SHELL, ["-c", SHELL_PRELUDE, bin, ...args], {
    timeout: timeoutMs,
    cancelSignal: signal,
    env: { PYTHONUNBUFFERED: "1" },
  });

  return stdout;
};

/** A running yt-dlp, for the downloads whose progress is streamed into a toast. */
export const spawnYtDlp = async (args: string[]) => {
  const bin = await resolveBinary("yt-dlp");

  return spawn(SHELL, ["-c", SHELL_PRELUDE, bin, ...args], {
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
};

/** The command line as a user could paste it into a terminal, for "Copy Command". */
export const ytDlpCommandLine = async (args: string[]) => {
  const bin = await resolveBinary("yt-dlp");
  const quote = (value: string) => (/^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`);
  return [bin, ...args].map(quote).join(" ");
};

/** True when the run was aborted by us, which is a superseded request rather than a failure. */
export const isAbortError = (error: unknown) =>
  error instanceof Error && (error.name === "AbortError" || (error as ExecaError).isCanceled === true);

// execa puts its own command line in `message`, and the yt-dlp output in `stderr`.
const ytDlpStderr = (error: unknown) => {
  if (error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string") {
    return error.stderr;
  }
  return error instanceof Error ? error.message : String(error);
};

export interface FriendlyError {
  title: string;
  message: string;
  /** Whether retrying the same URL could plausibly help, so the UI can hide a useless "Try Again". */
  retryable: boolean;
}

/** Turns a raw yt-dlp failure into something readable, instead of dumping the execa command line. */
export const describeYtDlpError = (error: unknown): FriendlyError => {
  if (error instanceof BinaryNotFoundError) {
    return { title: `${error.binary} Not Found`, message: error.message, retryable: false };
  }

  const stderr = ytDlpStderr(error);
  // yt-dlp prints the real cause on a line starting with "ERROR:".
  const errorLine =
    stderr
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("ERROR:"))
      ?.replace(/^ERROR:\s*/, "") ?? stderr.trim();

  const lower = errorLine.toLowerCase();

  if (lower.includes("unsupported url")) {
    return {
      title: "Unsupported Site",
      message: "yt-dlp has no extractor for this URL. Check its supported sites list.",
      retryable: false,
    };
  }
  if (lower.includes("unable to download") && lower.includes("404")) {
    return { title: "Video Not Found", message: "This video does not exist or was removed.", retryable: false };
  }
  // yt-dlp writes "members only" with a space ("Channel members only"), never "members-only".
  if (
    lower.includes("private") ||
    lower.includes("members only") ||
    lower.includes("sign in") ||
    lower.includes("login required") ||
    lower.includes("join this channel")
  ) {
    return {
      title: "Video Requires Sign-In",
      message: 'This video is private or restricted. Try the "Use Cookies from Browser" preference.',
      retryable: false,
    };
  }
  if (lower.includes("unavailable") || lower.includes("removed") || lower.includes("deleted")) {
    return { title: "Video Unavailable", message: "This video is no longer available.", retryable: false };
  }
  // A word boundary keeps "bitrate", "framerate" and "sample rate" out of the rate-limit branch.
  if (lower.includes("bad guest token") || /\brate[ -]?limit/.test(lower) || lower.includes("429")) {
    return {
      title: "Temporary Rate Limit",
      message: 'The site is rate-limiting requests. Try again, or set the "Use Cookies from Browser" preference.',
      retryable: true,
    };
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return { title: "Timed Out", message: "yt-dlp took too long to answer. Try again.", retryable: true };
  }

  return { title: "Could Not Read Video", message: errorLine || "yt-dlp could not read this URL.", retryable: true };
};

/** The full raw output of a failure, for "Copy Logs". */
export const ytDlpLogs = (error: unknown) => {
  const stderr = ytDlpStderr(error).trim();
  return stderr || (error instanceof Error ? error.message : String(error));
};

/** The download directory preference, with `~` expanded so Node's fs APIs can use it. */
export const getDownloadPath = () => {
  const { videoDownloadPath } = getPreferenceValues<Preferences>();
  return expandPath(videoDownloadPath || "~/Downloads");
};
