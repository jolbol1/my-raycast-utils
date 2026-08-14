import { Action, Icon } from "@raycast/api";
import { Svg } from "../../type";
import { fetchAndCopySvgFile } from "../../utils/fetch";
import { hasLightDarkVariants } from "../../utils/svg-route";
import { useSvglExtension } from "../app-context";

const CopySvgFileActions = ({ svg }: { svg: Svg }) => {
  const { addRecentSvgId } = useSvglExtension();

  const handleAction = (url: string, showContent: string, fileName: string) => {
    addRecentSvgId(svg.id);
    fetchAndCopySvgFile(url, showContent, fileName);
  };

  if (!hasLightDarkVariants(svg.route)) {
    const route = svg.route;
    return (
      <Action
        icon={Icon.Clipboard}
        title="Copy SVG File"
        onAction={() => handleAction(route, "Copied SVG file to clipboard", svg.title)}
      />
    );
  }

  const { light, dark } = svg.route;

  return (
    <>
      <Action
        icon={Icon.Clipboard}
        title="Copy Light SVG File"
        onAction={() => handleAction(light, "Copied Light SVG file to clipboard", `${svg.title}-light`)}
      />

      <Action
        icon={Icon.Clipboard}
        title="Copy Dark SVG File"
        onAction={() => handleAction(dark, "Copied Dark SVG file to clipboard", `${svg.title}-dark`)}
      />
    </>
  );
};

export default CopySvgFileActions;
