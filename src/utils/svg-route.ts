import { Svg } from "../type";

type Route = NonNullable<Svg["route"]>;

/**
 * Normalises a route (which is either a single URL/path or a light/dark pair)
 * into an always-present light/dark pair.
 */
export const routeVariants = (route: Route): { light: string; dark: string } =>
  typeof route === "string" ? { light: route, dark: route } : route;

/** The route to use when only one can be shown — the light variant. */
export const defaultRoute = (route: Route): string => routeVariants(route).light;

/** True when the route has genuinely distinct light and dark variants. */
export const hasLightDarkVariants = (route: Route | undefined): route is { dark: string; light: string } =>
  typeof route === "object";
