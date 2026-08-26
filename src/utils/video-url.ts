import { BrowserExtension, Clipboard, getPreferenceValues, getSelectedText } from "@raycast/api";
import { isLikelyUrl } from "./video";

/**
 * The URL to prefill a command with, taken from wherever the "Auto-Load Video URL" preference
 * points. Every source is best-effort: a missing browser extension or an empty selection just
 * leaves the field blank.
 */
export const readAutoLoadedUrl = async (): Promise<string | undefined> => {
  const { autoLoadVideoUrl } = getPreferenceValues<Preferences>();

  switch (autoLoadVideoUrl) {
    case "clipboard":
      return firstUrl(await Clipboard.readText());
    case "selection":
      try {
        return firstUrl(await getSelectedText());
      } catch {
        return undefined;
      }
    case "browser":
      try {
        const tabs = await BrowserExtension.getTabs();
        return firstUrl(tabs.find((tab) => tab.active)?.url);
      } catch {
        return undefined;
      }
    default:
      return undefined;
  }
};

const firstUrl = (text?: string) => {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  if (isLikelyUrl(trimmed)) return trimmed;
  // A copied line often carries a URL among other words ("Watch this: https://…").
  return trimmed.split(/\s+/).find((word) => isLikelyUrl(word) && /^https?:\/\//i.test(word));
};
