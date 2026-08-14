import { Grid } from "@raycast/api";
import { useSvglExtension } from "../app-context";
import SvgGridItem from "../svg-grid-item";

const RECENT_LIMIT = 12;

const RecentGrid = () => {
  const { svgs, recentSvgIds, pinnedSvgIds } = useSvglExtension();

  const recentSvgs = svgs
    .filter((svg) => recentSvgIds.includes(svg.id) && !pinnedSvgIds.includes(svg.id))
    .sort((a, b) => recentSvgIds.indexOf(a.id) - recentSvgIds.indexOf(b.id))
    .slice(0, RECENT_LIMIT);

  return (
    <Grid.Section title="Recently Used" subtitle={recentSvgs.length.toString()}>
      {recentSvgs.map((svg) => (
        <SvgGridItem key={svg.id} id={`recent_${svg.id}`} svg={svg} />
      ))}
    </Grid.Section>
  );
};

export default RecentGrid;
