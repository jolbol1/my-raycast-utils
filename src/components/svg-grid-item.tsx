import { Action, ActionPanel, Grid, Icon, Keyboard } from "@raycast/api";
import { Svg } from "../type";
import { fetchAndCopyPng } from "../utils/fetch";
import { useRenderSource } from "../hooks/use-render-source";
import { defaultRoute } from "../utils/svg-route";
import { useSvglExtension } from "./app-context";
import SvgAction from "./svg-action";
import SvgDetail from "./svg-detail";

interface SvgGridItemProps {
  svg: Svg;
  /** Optional stable item id, used to keep focus when reordering pinned items. */
  id?: string;
}

const SvgGridItem = ({ svg, id }: SvgGridItemProps) => {
  const { addRecentSvgId, refresh } = useSvglExtension();
  const { light, dark } = useRenderSource(svg.route);

  return (
    <Grid.Item
      id={id}
      content={{ value: { source: { light, dark } }, tooltip: svg.title }}
      title={svg.title}
      actions={
        <ActionPanel>
          <Action.Push icon={Icon.Eye} title="View Details" target={<SvgDetail svg={svg} />} />
          <Action
            icon={Icon.Image}
            title="Copy 4X PNG"
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onAction={() => {
              addRecentSvgId(svg.id);
              fetchAndCopyPng(defaultRoute(svg.route), svg.title, 4);
            }}
          />
          <SvgAction svg={svg} />
          <ActionPanel.Section>
            <Action
              icon={Icon.ArrowClockwise}
              title="Refresh Icons"
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={refresh}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
};

export default SvgGridItem;
