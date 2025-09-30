import { Action, ActionPanel, Grid } from "@raycast/api";
import { useSvglExtension } from "../app-context";
import SvgDetail from "../svg-detail";
import SvgAction from "../svg-action";
import { fetchAndCopyPng } from "../../utils/fetch";

interface CategoryGridProps {
  selectCategory: string;
}

const CategoryGrid = ({ selectCategory }: CategoryGridProps) => {
  const { categories, svgs, addRecentSvgId } = useSvglExtension();

  const getDefaultRoute = (svg: any) => {
    if (typeof svg.route === "string") {
      return svg.route;
    }
    return svg.route.light;
  };

  return (
    <Grid.Section
      title={`${selectCategory}`}
      subtitle={categories.find((category) => category.category === selectCategory)?.total.toString()}
    >
      {svgs
        .filter((svg) => svg.category === selectCategory || svg.category?.includes(selectCategory))
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
                <Action.Push title="View Details" target={<SvgDetail svg={svg} category={selectCategory} />} />
                <Action
                  title="Copy 4x PNG"
                  shortcut={{ modifiers: ["cmd"], key: "return" }}
                  onAction={() => {
                    addRecentSvgId(svg.id);
                    fetchAndCopyPng(getDefaultRoute(svg), svg.title, 4);
                  }}
                />
                <SvgAction svg={svg} category={selectCategory} />
              </ActionPanel>
            }
          />
        ))}
    </Grid.Section>
  );
};

export default CategoryGrid;
