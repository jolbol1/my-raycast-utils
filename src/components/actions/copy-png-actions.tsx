import { Action, Icon } from "@raycast/api";
import { Svg } from "../../type";
import { fetchAndCopyPng } from "../../utils/fetch";
import { useSvglExtension } from "../app-context";

const CopyPngActions = ({ svg }: { svg: Svg }) => {
  const { addRecentSvgId } = useSvglExtension();

  const handleAction = (url: string, scale: number) => {
    addRecentSvgId(svg.id);
    fetchAndCopyPng(url, svg.title, scale);
  };

  const scales = [1, 2, 4, 8, 16, 32, 64];

  if (typeof svg.route === "string") {
    return (
      <>
        {scales.map((scale) => (
          <Action
            key={scale}
            icon={Icon.Image}
            title={`Copy ${scale}x PNG`}
            onAction={() => handleAction(svg.route as string, scale)}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {scales.map((scale) => (
        <Action
          key={`light-${scale}`}
          icon={Icon.Image}
          title={`Copy Light ${scale}x PNG`}
          onAction={() => handleAction(svg.route.light, scale)}
        />
      ))}
      {scales.map((scale) => (
        <Action
          key={`dark-${scale}`}
          icon={Icon.Image}
          title={`Copy Dark ${scale}x PNG`}
          onAction={() => handleAction(svg.route.dark, scale)}
        />
      ))}
    </>
  );
};

export default CopyPngActions;
