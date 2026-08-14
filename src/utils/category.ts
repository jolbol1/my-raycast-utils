import { Svg } from "../type";

/**
 * Categories are either a single string or a list. Matching with `String.includes`
 * would also match substrings (e.g. "AI" inside "AI Tools"), so compare exactly.
 */
export const matchesCategory = (svg: Svg, category: string): boolean =>
  Array.isArray(svg.category) ? svg.category.includes(category) : svg.category === category;
