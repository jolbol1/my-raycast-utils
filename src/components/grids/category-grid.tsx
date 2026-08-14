import { Grid } from "@raycast/api";
import { matchesCategory } from "../../utils/category";
import { useSvglExtension } from "../app-context";
import SvgGridItem from "../svg-grid-item";

interface CategoryGridProps {
  selectCategory: string;
}

const CategoryGrid = ({ selectCategory }: CategoryGridProps) => {
  const { categories, svgs } = useSvglExtension();

  return (
    <Grid.Section
      title={selectCategory}
      subtitle={categories.find((category) => category.category === selectCategory)?.total.toString()}
    >
      {svgs
        .filter((svg) => matchesCategory(svg, selectCategory))
        .map((svg) => (
          <SvgGridItem key={svg.id} svg={svg} />
        ))}
    </Grid.Section>
  );
};

export default CategoryGrid;
