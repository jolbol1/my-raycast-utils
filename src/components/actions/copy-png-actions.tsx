import { Action, Icon, getPreferenceValues } from "@raycast/api";
import { Svg } from "../../type";
import { fetchAndCopyPng } from "../../utils/fetch";
import { preferredScaleOrder } from "../../utils/png-scales";
import { hasLightDarkVariants } from "../../utils/svg-route";
import { useSvglExtension } from "../app-context";

const CopyPngActions = ({ svg }: { svg: Svg }) => {
  const { addRecentSvgId } = useSvglExtension();
  const preferences = getPreferenceValues<Preferences.Index>();
  const scales = preferredScaleOrder(preferences.defaultPngScale);

  const handleAction = (url: string, scale: number) => {
    addRecentSvgId(svg.id);
    fetchAndCopyPng(url, svg.title, scale);
  };

  if (!hasLightDarkVariants(svg.route)) {
    const route = svg.route;
    return (
      <>
        {scales.map((scale) => (
          <Action
            key={scale}
            icon={Icon.Image}
            title={`Copy ${scale}x PNG`}
            onAction={() => handleAction(route, scale)}
          />
        ))}
      </>
    );
  }

  const { light, dark } = svg.route;

  return (
    <>
      {scales.map((scale) => (
        <Action
          key={`light-${scale}`}
          icon={Icon.Image}
          title={`Copy Light ${scale}x PNG`}
          onAction={() => handleAction(light, scale)}
        />
      ))}
      {scales.map((scale) => (
        <Action
          key={`dark-${scale}`}
          icon={Icon.Image}
          title={`Copy Dark ${scale}x PNG`}
          onAction={() => handleAction(dark, scale)}
        />
      ))}
    </>
  );
};

export default CopyPngActions;
