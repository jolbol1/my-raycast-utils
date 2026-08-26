import { useEffect, useMemo, useState } from "react";
import { findAbVariants } from "../utils/ab-thumbnails";
import {
  ThumbnailCandidate,
  checkThumbnail,
  collectThumbnails,
  getYouTubeVideoId,
  toVariantCandidates,
} from "../utils/thumbnails";
import { VideoInfo } from "../utils/video";

export interface ThumbnailsState {
  thumbnails: ThumbnailCandidate[];
  /** The covers YouTube is A/B testing, which are not part of the published set. */
  variants: ThumbnailCandidate[];
  /** True when YouTube stopped answering mid-sweep, so a cover may be missing from the list. */
  areVariantsPartial: boolean;
  isChecking: boolean;
}

const CONCURRENCY = 6;

/**
 * The thumbnails for a video, shown at once and then corrected: every candidate is checked in
 * the background, the ones the server does not have are dropped, and the rest gain their size.
 * Tested covers are looked for at the same time, and kept in their own list.
 */
export const useThumbnails = (info: VideoInfo | undefined, url: string): ThumbnailsState => {
  const candidates = useMemo(() => collectThumbnails(info, url), [info, url]);
  const [thumbnails, setThumbnails] = useState<ThumbnailCandidate[]>(candidates);
  const [variants, setVariants] = useState<ThumbnailCandidate[]>([]);
  const [areVariantsPartial, setAreVariantsPartial] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isSearchingVariants, setIsSearchingVariants] = useState(false);

  const videoId = useMemo(() => getYouTubeVideoId(info?.webpage_url ?? url) ?? getYouTubeVideoId(url), [info, url]);

  useEffect(() => {
    setThumbnails(candidates);

    if (candidates.length === 0) {
      setIsChecking(false);
      return;
    }

    let cancelled = false;
    setIsChecking(true);

    const queue = [...candidates];
    const worker = async () => {
      for (let next = queue.shift(); next && !cancelled; next = queue.shift()) {
        const candidate = next;
        const { available, bytes } = await checkThumbnail(candidate);
        if (cancelled) return;

        setThumbnails((current) =>
          available
            ? current.map((entry) => (entry.url === candidate.url ? { ...entry, bytes } : entry))
            : current.filter((entry) => entry.url !== candidate.url),
        );
      }
    };

    Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker)).finally(() => {
      if (!cancelled) setIsChecking(false);
    });

    return () => {
      cancelled = true;
    };
  }, [candidates]);

  useEffect(() => {
    setVariants([]);
    setAreVariantsPartial(false);

    if (!videoId) {
      setIsSearchingVariants(false);
      return;
    }

    const abort = new AbortController();
    setIsSearchingVariants(true);

    (async () => {
      try {
        const sweep = await findAbVariants(videoId, abort.signal);
        if (abort.signal.aborted) return;

        const found = toVariantCandidates(sweep.variants);
        setAreVariantsPartial(sweep.interrupted);

        // The byte size is the only measure of these that costs nothing extra to show.
        const sized = await Promise.all(
          found.map(async (variant) => ({ ...variant, bytes: (await checkThumbnail(variant)).bytes })),
        );
        if (!abort.signal.aborted) setVariants(sized);
      } catch {
        // A video with no test, or a YouTube page we could not read, simply has no variants.
      } finally {
        if (!abort.signal.aborted) setIsSearchingVariants(false);
      }
    })();

    return () => abort.abort();
  }, [videoId]);

  return { thumbnails, variants, areVariantsPartial, isChecking: isChecking || isSearchingVariants };
};
