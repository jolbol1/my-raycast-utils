import { Action, ActionPanel, Grid, Icon, getPreferenceValues } from "@raycast/api";
import { Svg } from "../type";
import { useSvglExtension } from "./app-context";
import { fetchAndCopyPng } from "../utils/fetch";

interface SvgDetailProps {
  svg: Svg;
  category: string;
}

interface Variant {
  title: string;
  route: string;
}

export default function SvgDetail({ svg, category }: SvgDetailProps) {
  const { addRecentSvgId } = useSvglExtension();
  const preferences = getPreferenceValues<Preferences.Index>();
  const defaultPngScale = parseInt(preferences.defaultPngScale || "4");

  const variants: Variant[] = [];

  // Build variants list
  const hasLightDark = typeof svg.route !== "string";
  const hasWordmark = svg.wordmark !== undefined;

  if (hasLightDark) {
    // Light and Dark normal
    variants.push({
      title: "Light",
      route: svg.route.light,
    });
    variants.push({
      title: "Dark",
      route: svg.route.dark,
    });

    // Light and Dark wordmark
    if (hasWordmark && typeof svg.wordmark !== "string") {
      variants.push({
        title: "Light Wordmark",
        route: svg.wordmark.light,
      });
      variants.push({
        title: "Dark Wordmark",
        route: svg.wordmark.dark,
      });
    } else if (hasWordmark && typeof svg.wordmark === "string") {
      variants.push({
        title: "Wordmark",
        route: svg.wordmark,
      });
    }
  } else {
    // Single normal
    variants.push({
      title: "Normal",
      route: svg.route as string,
    });

    // Single wordmark
    if (hasWordmark) {
      variants.push({
        title: "Wordmark",
        route: svg.wordmark as string,
      });
    }
  }

  const allScales = [1, 2, 4, 8, 16, 32, 64];
  const scales = [defaultPngScale, ...allScales.filter((s) => s !== defaultPngScale)];

  return (
    <Grid columns={4} navigationTitle={`${svg.title} - Variants`} searchBarPlaceholder="Search variants">
      <Grid.Section title={svg.title} subtitle={`${variants.length} variant${variants.length > 1 ? "s" : ""}`}>
        {variants.map((variant, index) => (
          <Grid.Item
            key={index}
            content={{
              value: { source: variant.route },
              tooltip: variant.title,
            }}
            title={variant.title}
            actions={
              <ActionPanel>
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
              </ActionPanel>
            }
          />
        ))}
      </Grid.Section>
    </Grid>
  );
}
