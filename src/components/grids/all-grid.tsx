import { Action, ActionPanel, Grid } from "@raycast/api";
import { useSvglExtension } from "../app-context";
import SvgDetail from "../svg-detail";
import SvgAction from "../svg-action";
import PinnedGrid from "./pinned-grid";
import RecentGrid from "./recent-grid";
import { fetchAndCopyPng } from "../../utils/fetch";

const AllGrid = () => {
  const { categories, svgs, addRecentSvgId } = useSvglExtension();

  const getDefaultRoute = (svg: any) => {
    if (typeof svg.route === "string") {
      return svg.route;
    }
    return svg.route.light;
  };

  return (
    <>
      <PinnedGrid />
      <RecentGrid />
      {categories.map((category, index) => (
        <Grid.Section title={category.category} subtitle={category.total.toString()} key={index}>
          {svgs
            .filter((svg) => svg.category === category.category || svg.category?.includes(category.category))
            .map((svg, index) => (
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
                    <Action.Push
                      title="View Details"
                      target={<SvgDetail svg={svg} category={category.category} />}
                    />
                    <Action
                      title="Copy 4x PNG"
                      shortcut={{ modifiers: ["cmd"], key: "return" }}
                      onAction={() => {
                        addRecentSvgId(svg.id);
                        fetchAndCopyPng(getDefaultRoute(svg), svg.title, 4);
                      }}
                    />
                    <SvgAction svg={svg} category={category.category} />
                  </ActionPanel>
                }
              />
            ))}
        </Grid.Section>
      ))}
    </>
  );
};

export default AllGrid;
