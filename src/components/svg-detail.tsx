import { Action, ActionPanel, Grid, Icon, getPreferenceValues } from "@raycast/api";
import { Svg } from "../type";
import { fetchAndCopyPng } from "../utils/fetch";
import { preferredScaleOrder } from "../utils/png-scales";
import { hasLightDarkVariants } from "../utils/svg-route";
import { useRenderSource } from "../hooks/use-render-source";
import { useSvglExtension } from "./app-context";
import SvgAction from "./svg-action";

interface SvgDetailProps {
  svg: Svg;
}

interface Variant {
  title: string;
  route: string;
}

const buildVariants = (svg: Svg): Variant[] => {
  const variants: Variant[] = [];

  if (hasLightDarkVariants(svg.route)) {
    variants.push({ title: "Light", route: svg.route.light });
    variants.push({ title: "Dark", route: svg.route.dark });
  } else {
    variants.push({ title: "Normal", route: svg.route });
  }

  if (hasLightDarkVariants(svg.wordmark)) {
    variants.push({ title: "Light Wordmark", route: svg.wordmark.light });
    variants.push({ title: "Dark Wordmark", route: svg.wordmark.dark });
  } else if (svg.wordmark) {
    variants.push({ title: "Wordmark", route: svg.wordmark });
  }

  return variants;
};

interface VariantGridItemProps {
  svg: Svg;
  variant: Variant;
  scales: number[];
}

const VariantGridItem = ({ svg, variant, scales }: VariantGridItemProps) => {
  const { addRecentSvgId } = useSvglExtension();
  // A variant is always a single route, so both resolved sources are the same file.
  const { light } = useRenderSource(variant.route);

  return (
    <Grid.Item
      content={{ value: { source: light }, tooltip: variant.title }}
      title={variant.title}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Copy PNG">
            {scales.map((scale) => (
              <Action
                key={scale}
                icon={Icon.Image}
                title={`Copy ${scale}x PNG`}
                onAction={() => {
                  addRecentSvgId(svg.id);
                  fetchAndCopyPng(variant.route, `${svg.title}-${variant.title}`, scale);
                }}
              />
            ))}
          </ActionPanel.Section>
          <SvgAction svg={svg} />
        </ActionPanel>
      }
    />
  );
};

export default function SvgDetail({ svg }: SvgDetailProps) {
  const preferences = getPreferenceValues<Preferences.Index>();
  const scales = preferredScaleOrder(preferences.defaultPngScale);

  const variants = buildVariants(svg);

  return (
    <Grid
      inset={Grid.Inset.Medium}
      columns={4}
      navigationTitle={`${svg.title} - Variants`}
      searchBarPlaceholder="Search variants"
    >
      <Grid.Section title={svg.title} subtitle={`${variants.length} variant${variants.length > 1 ? "s" : ""}`}>
        {variants.map((variant) => (
          <VariantGridItem key={variant.title} svg={svg} variant={variant} scales={scales} />
        ))}
      </Grid.Section>
    </Grid>
  );
}
