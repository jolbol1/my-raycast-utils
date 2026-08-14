import { Grid } from "@raycast/api";
import { matchesCategory } from "../../utils/category";
import { useSvglExtension } from "../app-context";
import SvgGridItem from "../svg-grid-item";
import PinnedGrid from "./pinned-grid";
import RecentGrid from "./recent-grid";

const AllGrid = () => {
  const { categories, svgs } = useSvglExtension();

  return (
    <>
      <PinnedGrid />
      <RecentGrid />
      {categories.map((category) => (
        <Grid.Section title={category.category} subtitle={category.total.toString()} key={category.category}>
          {svgs
            .filter((svg) => matchesCategory(svg, category.category))
            .map((svg) => (
              <SvgGridItem key={`${category.category}_${svg.id}`} svg={svg} />
            ))}
        </Grid.Section>
      ))}
    </>
  );
};

export default AllGrid;
