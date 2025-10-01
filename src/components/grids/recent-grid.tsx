import { Action, ActionPanel, Grid } from "@raycast/api";
import { useSvglExtension } from "../app-context";
import SvgDetail from "../svg-detail";
import SvgAction from "../svg-action";
import { fetchAndCopyPng } from "../../utils/fetch";

const RecentGrid = () => {
  const { svgs, recentSvgIds, pinnedSvgIds, addRecentSvgId } = useSvglExtension();

  const getDefaultRoute = (svg: any) => {
    if (typeof svg.route === "string") {
      return svg.route;
    }
    return svg.route.light;
  };

  return (
    <Grid.Section
      title="Recently Used"
      subtitle={Math.min(recentSvgIds.filter((id) => !pinnedSvgIds.includes(id)).length, 12).toString()}
    >
      {svgs
        .filter((svg) => recentSvgIds.includes(svg.id) && !pinnedSvgIds.includes(svg.id))
        .sort((a, b) => recentSvgIds.indexOf(a.id) - recentSvgIds.indexOf(b.id))
        .slice(0, 12)
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
                </ActionPanel>
              }
            />
          );
        })}
    </Grid.Section>
  );
};

export default RecentGrid;
