export const getPrefixFromSvgUrl = (svgUrl: string) => {
  return svgUrl.split("/").pop()!.replace(".svg", "").split("-").join("_");
};

/**
 * Namespaces every id in an SVG so that pasting several of them into one document does not
 * collide. Every way of referring to an id has to be rewritten alongside the definitions,
 * or the reference dangles and the element it draws disappears:
 *
 * - `url(#a)` for fills, clips and masks
 * - `href="#a"` / `xlink:href="#a"` for `<use>` and for gradients that inherit stops
 */
export const prefixSvgIds = (content: string, prefix: string): string => {
  return (
    content
      .replace(/id="([^"]+)"/g, `id="${prefix}-$1"`)
      // The reference pattern must stop at the closing paren: a `[^"]+` class is greedy
      // across `)`, so in a <style> block like `clip-path:url(#a);fill:url(#b)` it swallows
      // both references and leaves the second one unprefixed.
      .replace(/url\(#([^)"]+)\)/g, `url(#${prefix}-$1)`)
      .replace(/\b((?:xlink:)?href=")#([^"]+)"/g, `$1#${prefix}-$2"`)
  );
};
