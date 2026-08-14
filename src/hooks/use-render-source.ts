import { useEffect, useState } from "react";
import { Svg } from "../type";
import { getCachedRenderSource, resolveRenderSource } from "../utils/render-source";
import { routeVariants } from "../utils/svg-route";

/**
 * Resolves a route to the sources Raycast should actually render, working around its
 * inability to resolve `clip-path` references. Returns the original URLs immediately and
 * swaps in sanitised copies once they are ready, so nothing blocks the first paint.
 */
export const useRenderSource = (route: Svg["route"]): { light: string; dark: string } => {
  const { light, dark } = routeVariants(route);

  const [sources, setSources] = useState(() => ({
    light: getCachedRenderSource(light) ?? light,
    dark: getCachedRenderSource(dark) ?? dark,
  }));

  useEffect(() => {
    // Already resolved from the synchronous cache — no work, and no needless re-render.
    if (getCachedRenderSource(light) !== undefined && getCachedRenderSource(dark) !== undefined) {
      return;
    }

    let cancelled = false;
    (async () => {
      const [resolvedLight, resolvedDark] = await Promise.all([resolveRenderSource(light), resolveRenderSource(dark)]);
      if (!cancelled) {
        setSources({ light: resolvedLight, dark: resolvedDark });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [light, dark]);

  return sources;
};
