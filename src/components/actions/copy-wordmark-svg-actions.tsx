import { Action, Icon } from "@raycast/api";
import { Svg } from "../../type";
import { fetchAndCopySvg } from "../../utils/fetch";
import { hasLightDarkVariants } from "../../utils/svg-route";
import { useSvglExtension } from "../app-context";

const CopyWordmarkSvgAction = ({ svg }: { svg: Svg }) => {
  const { addRecentSvgId } = useSvglExtension();

  const handleAction = (url: string, showContent: string) => {
    addRecentSvgId(svg.id);
    fetchAndCopySvg(url, showContent);
  };

  if (!svg.wordmark) {
    return null;
  }

  if (!hasLightDarkVariants(svg.wordmark)) {
    const wordmark = svg.wordmark;
    return (
      <Action
        icon={Icon.Clipboard}
        title="Copy SVG Wordmark File"
        onAction={() => handleAction(wordmark, "Copied SVG Wordmark to clipboard")}
      />
    );
  }

  const { light, dark } = svg.wordmark;

  return (
    <>
      <Action
        icon={Icon.Clipboard}
        title="Copy Light SVG Wordmark File"
        shortcut={{ modifiers: ["cmd", "shift"], key: "l" }}
        onAction={() => handleAction(light, "Copied Light SVG Wordmark to clipboard")}
      />

      <Action
        icon={Icon.Clipboard}
        title="Copy Dark SVG Wordmark File"
        shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
        onAction={() => handleAction(dark, "Copied Dark SVG Wordmark to clipboard")}
      />
    </>
  );
};

export default CopyWordmarkSvgAction;
