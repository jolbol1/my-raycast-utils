import { useCallback, useEffect, useRef, useState } from "react";
import { VideoInfo, fetchVideoInfo, isLikelyUrl, withProtocol } from "../utils/video";
import { isAbortError } from "../utils/yt-dlp";

export interface VideoInfoState {
  info?: VideoInfo;
  isLoading: boolean;
  error?: Error;
  revalidate: () => void;
}

interface UseVideoInfoOptions {
  /** Typing a URL should not start a yt-dlp run on every keystroke. */
  debounceMs?: number;
}

/** Metadata for whatever URL is in the field, reloaded as it changes and aborted when superseded. */
export const useVideoInfo = (url: string, { debounceMs = 400 }: UseVideoInfoOptions = {}): VideoInfoState => {
  const [info, setInfo] = useState<VideoInfo | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    const trimmed = url.trim();

    controller.current?.abort();

    if (!isLikelyUrl(trimmed)) {
      setInfo(undefined);
      setError(undefined);
      setIsLoading(false);
      return;
    }

    const abort = new AbortController();
    controller.current = abort;
    setIsLoading(true);
    setError(undefined);

    const timer = setTimeout(async () => {
      try {
        const loaded = await fetchVideoInfo(withProtocol(trimmed), abort.signal);
        if (abort.signal.aborted) return;
        setInfo(loaded);
      } catch (loadError) {
        if (abort.signal.aborted || isAbortError(loadError)) return;
        setInfo(undefined);
        setError(loadError instanceof Error ? loadError : new Error(String(loadError)));
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [url, attempt, debounceMs]);

  const revalidate = useCallback(() => setAttempt((value) => value + 1), []);

  return { info, isLoading, error, revalidate };
};
