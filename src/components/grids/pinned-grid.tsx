import { Grid } from "@raycast/api";
import { useSvglExtension } from "../app-context";
import SvgGridItem from "../svg-grid-item";

const PinnedGrid = () => {
  const { pinnedSvgIds, svgs } = useSvglExtension();

  const pinnedSvgs = svgs
    .filter((svg) => pinnedSvgIds.includes(svg.id))
    .sort((a, b) => pinnedSvgIds.indexOf(a.id) - pinnedSvgIds.indexOf(b.id));

  return (
    <Grid.Section title="Pinned" subtitle={pinnedSvgs.length.toString()}>
      {pinnedSvgs.map((svg) => (
        <SvgGridItem key={svg.id} id={`pinned_${svg.id}`} svg={svg} />
      ))}
    </Grid.Section>
  );
};

export default PinnedGrid;
