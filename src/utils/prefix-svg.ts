export const getPrefixFromSvgUrl = (svgUrl: string) => {
  return svgUrl.split("/").pop()!.replace(".svg", "").split("-").join("_");
};

export const prefixSvgIds = (content: string, prefix: string): string => {
  // The reference pattern must stop at the closing paren: a `[^"]+` class is greedy
  // across `)`, so in a <style> block like `clip-path:url(#a);fill:url(#b)` it swallows
  // both references and leaves the second one unprefixed.
  return content.replace(/id="([^"]+)"/g, `id="${prefix}-$1"`).replace(/url\(#([^)"]+)\)/g, `url(#${prefix}-$1)`);
};
