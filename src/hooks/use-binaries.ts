import { useEffect, useState } from "react";
import { resolveBinary, resolveOptionalBinary } from "../utils/yt-dlp";

export interface BinariesState {
  /** The reason yt-dlp cannot be used, or undefined when it is ready. */
  ytDlpError?: string;
  /** True once the check ran and found no ffmpeg: merging and recoding will be unavailable. */
  isFfmpegMissing: boolean;
  isChecking: boolean;
}

/** Checks the command line tools once on mount, so a command can explain a missing one up front. */
export const useBinaries = (): BinariesState => {
  const [ytDlpError, setYtDlpError] = useState<string>();
  const [isFfmpegMissing, setIsFfmpegMissing] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [ytDlp, ffmpeg] = await Promise.all([
        resolveBinary("yt-dlp").then(
          () => undefined,
          (error: unknown) => (error instanceof Error ? error.message : String(error)),
        ),
        resolveOptionalBinary("ffmpeg"),
      ]);

      if (cancelled) return;
      setYtDlpError(ytDlp);
      setIsFfmpegMissing(!ffmpeg);
      setIsChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { ytDlpError, isFfmpegMissing, isChecking };
};
