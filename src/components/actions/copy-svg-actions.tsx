import { Action, Icon } from "@raycast/api";
import { Svg } from "../../type";
import { fetchAndCopySvg } from "../../utils/fetch";
import { hasLightDarkVariants } from "../../utils/svg-route";
import { useSvglExtension } from "../app-context";

const CopySvgActions = ({ svg }: { svg: Svg }) => {
  const { addRecentSvgId } = useSvglExtension();

  const handleAction = (url: string, showContent: string) => {
    addRecentSvgId(svg.id);
    fetchAndCopySvg(url, showContent);
  };

  if (!hasLightDarkVariants(svg.route)) {
    const route = svg.route;
    return (
      <Action
        icon={Icon.Clipboard}
        title="Copy SVG Text"
        onAction={() => handleAction(route, "Copied SVG text to clipboard")}
      />
    );
  }

  const { light, dark } = svg.route;

  return (
    <>
      <Action
        icon={Icon.Clipboard}
        title="Copy Light SVG Text"
        shortcut={{ modifiers: ["cmd"], key: "l" }}
        onAction={() => handleAction(light, "Copied Light SVG text to clipboard")}
      />

      <Action
        icon={Icon.Clipboard}
        title="Copy Dark SVG Text"
        shortcut={{ modifiers: ["cmd"], key: "d" }}
        onAction={() => handleAction(dark, "Copied Dark SVG text to clipboard")}
      />
    </>
  );
};

export default CopySvgActions;
