import { Action, ActionPanel, Grid } from "@raycast/api";
import { useSvglExtension } from "../app-context";
import SvgDetail from "../svg-detail";
import SvgAction from "../svg-action";
import { fetchAndCopyPng } from "../../utils/fetch";

const PinnedGrid = () => {
  const { pinnedSvgIds, svgs, addRecentSvgId } = useSvglExtension();

  const getDefaultRoute = (svg: any) => {
    if (typeof svg.route === "string") {
      return svg.route;
    }
    return svg.route.light;
  };

  return (
    <Grid.Section title="Pinned" subtitle={pinnedSvgIds.length.toString()}>
      {svgs
        .filter((svg) => pinnedSvgIds.includes(svg.id))
        .sort((a, b) => pinnedSvgIds.indexOf(a.id) - pinnedSvgIds.indexOf(b.id))
        .map((svg, index) => {
          const category = svg.category?.[0] ?? svg.category;
          return (
            <Grid.Item
              key={index}
              content={{
                value: {
                  source: {
                    light: typeof svg.route === "string" ? svg.route : svg.route.light,
                    dark: typeof svg.route === "string" ? svg.route : svg.route.dark,
                  },
                },
                tooltip: svg.title,
              }}
              title={svg.title}
              id={`pinned_${svg.id}`}
              actions={
                <ActionPanel>
                  <Action.Push title="View Details" target={<SvgDetail svg={svg} category={category} />} />
                  <Action
                    title="Copy 4x PNG"
                    shortcut={{ modifiers: ["cmd"], key: "return" }}
                    onAction={() => {
                      addRecentSvgId(svg.id);
                      fetchAndCopyPng(getDefaultRoute(svg), svg.title, 4);
                    }}
                  />
                  <SvgAction svg={svg} category={category} />
                </ActionPanel>
              }
            />
          );
        })}
    </Grid.Section>
  );
};

export default PinnedGrid;
