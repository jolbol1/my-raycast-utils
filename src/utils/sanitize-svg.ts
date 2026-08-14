/**
 * Rewrites the two constructs Raycast's image renderer gets wrong, both of which make an
 * icon render as a blank tile.
 *
 * 1. `clip-path="url(#…)"` is not resolved at all, so anything wrapped in one is clipped
 *    away. In practice every clip path in the svgl library is a full-canvas rect (or the
 *    equivalent `M0 0h{W}v{H}H0z` path) emitted by Figma/Illustrator, so dropping the
 *    reference is visually a no-op. Clip paths that genuinely crop are left alone —
 *    showing uncropped artwork would be worse than the status quo.
 *
 * 2. `mask-type: alpha` is ignored, so the mask falls back to the default *luminance*
 *    type. A mask drawn in black (Next.js) or in a dark gradient (Bklit) then has
 *    luminance ≈ 0 and hides everything it should have revealed. Where every paint in
 *    the mask is fully opaque — true throughout this library, none of them use
 *    `stop-opacity` — the alpha channel is 1 inside the shape and 0 outside, which is
 *    exactly a luminance mask painted white. Repainting the mask white and dropping the
 *    `mask-type` therefore preserves the shape precisely.
 */

const VIEW_BOX_RE = /viewBox\s*=\s*"\s*([-\d.eE]+)[,\s]+([-\d.eE]+)[,\s]+([-\d.eE]+)[,\s]+([-\d.eE]+)\s*"/;
const CLIP_PATH_REF_RE = /\sclip-path\s*=\s*"url\(#([^)"]+)\)"/g;
const CLIP_PATH_DEF_RE = /<clipPath[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/clipPath>/g;

/** A shape is treated as full-canvas if it covers at least this much of the viewBox. */
const COVERAGE_THRESHOLD = 0.9;

/** Corner radius above this fraction of the shape counts as a real crop, not a rounding. */
const CORNER_TOLERANCE = 0.02;

const attr = (tag: string, name: string): number | undefined => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([-\\d.eE]+)"`));
  if (!match) return undefined;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : undefined;
};

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Bounding box of a path built only from move/line-to-axis commands — which is what
 * a rectangular clip path is, in any of the spellings the exporters emit
 * (`M0 0h54v32.4H0z`, `M.332 0h56v64h-56z`, …). Returns undefined for anything
 * with curves or arcs, which is then treated as a real crop and left alone.
 */
const axisAlignedPathBox = (d: string): Box | undefined => {
  const tokens = d.match(/[MmHhVvZz]|-?[\d.]+(?:e-?\d+)?/gi);
  if (!tokens) return undefined;

  let x = 0;
  let y = 0;
  let box: Box | undefined;
  const extend = () => {
    box = box
      ? {
          minX: Math.min(box.minX, x),
          minY: Math.min(box.minY, y),
          maxX: Math.max(box.maxX, x),
          maxY: Math.max(box.maxY, y),
        }
      : { minX: x, minY: y, maxX: x, maxY: y };
  };

  const next = (i: number) => Number.parseFloat(tokens[i]);

  for (let i = 0; i < tokens.length; i++) {
    const command = tokens[i];
    switch (command) {
      case "M":
      case "m": {
        const dx = next(++i);
        const dy = next(++i);
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return undefined;
        x = command === "M" ? dx : x + dx;
        y = command === "M" ? dy : y + dy;
        extend();
        break;
      }
      case "H":
      case "h": {
        const dx = next(++i);
        if (!Number.isFinite(dx)) return undefined;
        x = command === "H" ? dx : x + dx;
        extend();
        break;
      }
      case "V":
      case "v": {
        const dy = next(++i);
        if (!Number.isFinite(dy)) return undefined;
        y = command === "V" ? dy : y + dy;
        extend();
        break;
      }
      case "Z":
      case "z":
        break;
      default:
        // Any curve, arc or diagonal line: not a plain rectangle.
        return undefined;
    }
  }

  return box;
};

const boxCoversCanvas = (box: Box, width: number, height: number): boolean =>
  box.minX <= width * (1 - COVERAGE_THRESHOLD) &&
  box.minY <= height * (1 - COVERAGE_THRESHOLD) &&
  box.maxX - box.minX >= width * COVERAGE_THRESHOLD &&
  box.maxY - box.minY >= height * COVERAGE_THRESHOLD;

const coversCanvas = (body: string, width: number, height: number): boolean => {
  const rect = body.match(/<rect\b[^>]*>/);
  if (rect) {
    const w = attr(rect[0], "width");
    const h = attr(rect[0], "height");
    if (w === undefined || h === undefined) return false;

    // Rounded corners really do crop: Coinbase clips with rx=24 on a 48px box, which is
    // a circle, not a full-canvas rect.
    const rx = attr(rect[0], "rx") ?? 0;
    const ry = attr(rect[0], "ry") ?? 0;
    if (rx > w * CORNER_TOLERANCE || ry > h * CORNER_TOLERANCE) return false;

    const x = attr(rect[0], "x") ?? 0;
    const y = attr(rect[0], "y") ?? 0;
    return boxCoversCanvas({ minX: x, minY: y, maxX: x + w, maxY: y + h }, width, height);
  }

  const path = body.match(/<path\b[^>]*\bd\s*=\s*"([^"]+)"/);
  if (path) {
    const box = axisAlignedPathBox(path[1]);
    return box !== undefined && boxCoversCanvas(box, width, height);
  }

  return false;
};

const MASK_DEF_RE = /<mask\b([^>]*)>([\s\S]*?)<\/mask>/g;
const ALPHA_MASK_RE = /mask-type\s*[:=]\s*["']?\s*alpha/i;
/**
 * Anything that makes a paint partly transparent, which would break the white rewrite.
 * Deliberately precise: a looser pattern also matches `flood-opacity`, a filter primitive
 * attribute that says nothing about the mask's own paints.
 */
const TRANSPARENCY_RE = /(?:^|\s)(?:fill-|stop-|stroke-)?opacity\s*=|(?:^|[;{\s])opacity\s*:/i;
/** A filter can reshape the alpha channel, so luminance would no longer match it. */
const FILTER_USE_RE = /\sfilter\s*=\s*"url\(/i;
const DRAWABLE_RE = /<(path|rect|circle|ellipse|polygon|polyline|line|g|use)\b([^>]*?)(\/?)>/g;
const GRADIENT_DEF_RE = /<(linearGradient|radialGradient)\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;

/** Repaints the body of an alpha mask white so it behaves identically as a luminance mask. */
const repaintMaskWhite = (body: string): string =>
  body.replace(DRAWABLE_RE, (tag, name, attrs: string, selfClose) => {
    const cleaned = attrs
      .replace(/\sfill\s*=\s*"[^"]*"/g, "")
      // A `fill:` declaration in the style attribute overrides the presentation
      // attribute, so Vite's `style="fill:#000"` would keep the mask black.
      .replace(/\sstyle\s*=\s*"([^"]*)"/g, (whole, css: string) => {
        const stripped = css.replace(/(?:^|;)\s*fill\s*:[^;]*/g, "").replace(/^;+|;+$/g, "");
        return stripped.trim() === "" ? "" : ` style="${stripped}"`;
      });
    return `<${name}${cleaned} fill="#fff"${selfClose}>`;
  });

/**
 * Converts `mask-type: alpha` masks into equivalent luminance masks. Returns `null` when
 * there is nothing to convert, or when any paint involved is not fully opaque.
 */
export const normalizeAlphaMasks = (svg: string): string | null => {
  const gradients = new Map<string, string>();
  for (const match of svg.matchAll(GRADIENT_DEF_RE)) {
    gradients.set(match[2], match[3]);
  }

  let changed = false;
  let bailed = false;

  const result = svg.replace(MASK_DEF_RE, (whole, attrs: string, body: string) => {
    if (!ALPHA_MASK_RE.test(attrs)) {
      return whole;
    }

    // Any partial transparency means the alpha channel is not simply "1 inside the
    // shape", so repainting white would change the result.
    if (TRANSPARENCY_RE.test(body) || TRANSPARENCY_RE.test(attrs) || FILTER_USE_RE.test(body)) {
      bailed = true;
      return whole;
    }
    // Gradients can be referenced by attribute or from the style attribute.
    for (const [, id] of body.matchAll(/fill\s*[=:]\s*"?url\(#([^)"]+)\)/g)) {
      const stops = gradients.get(id);
      if (stops === undefined || TRANSPARENCY_RE.test(stops)) {
        bailed = true;
        return whole;
      }
    }

    const cleanedAttrs = attrs
      .replace(/\sstyle\s*=\s*"[^"]*"/g, (style) => {
        const stripped = style.replace(/mask-type\s*:\s*[^;"]*;?/gi, "");
        return /style\s*=\s*"\s*"/.test(stripped) ? "" : stripped;
      })
      .replace(/\smask-type\s*=\s*"[^"]*"/gi, "");

    changed = true;
    return `<mask${cleanedAttrs}>${repaintMaskWhite(body)}</mask>`;
  });

  return changed && !bailed ? result : null;
};

const XLINK_NS = "http://www.w3.org/1999/xlink";
const USE_RE = /<use\b([^>]*?)(\/?)>/g;

/**
 * Raycast resolves only the legacy `xlink:href` on `<use>`, not the modern `href`, so a
 * `<use href="#…">` draws nothing. Adding the legacy spelling alongside is harmless in
 * renderers that already understand the modern one.
 */
export const addXlinkHrefToUse = (svg: string): string | null => {
  let changed = false;

  let output = svg.replace(USE_RE, (whole, attrs: string, selfClose: string) => {
    if (/\bxlink:href\s*=/.test(attrs)) {
      return whole;
    }
    const href = attrs.match(/(?:^|\s)href\s*=\s*"([^"]*)"/);
    if (!href) {
      return whole;
    }
    changed = true;
    return `<use${attrs} xlink:href="${href[1]}"${selfClose}>`;
  });

  if (!changed) {
    return null;
  }

  if (!/xmlns:xlink\s*=/.test(output)) {
    output = output.replace(/<svg\b/, `<svg xmlns:xlink="${XLINK_NS}"`);
  }

  return output;
};

/**
 * Applies every rewrite Raycast needs. Returns `null` when the SVG renders correctly
 * as-is, in which case the original source is used unchanged.
 */
export const sanitizeForRaycast = (svg: string): string | null => {
  let output = svg;
  let changed = false;

  const declipped = stripFullCanvasClipPaths(output);
  if (declipped !== null) {
    output = declipped;
    changed = true;
  }

  const demasked = normalizeAlphaMasks(output);
  if (demasked !== null) {
    output = demasked;
    changed = true;
  }

  const linked = addXlinkHrefToUse(output);
  if (linked !== null) {
    output = linked;
    changed = true;
  }

  return changed ? output : null;
};

/**
 * Removes `clip-path` references when every one of them points at a full-canvas shape.
 * Returns `null` when there is nothing to do, or when any clip path genuinely crops.
 */
export const stripFullCanvasClipPaths = (svg: string): string | null => {
  const referenced = [...svg.matchAll(CLIP_PATH_REF_RE)].map((match) => match[1]);
  if (referenced.length === 0) {
    return null;
  }

  const viewBox = svg.match(VIEW_BOX_RE);
  if (!viewBox) {
    return null;
  }
  const width = Number.parseFloat(viewBox[3]);
  const height = Number.parseFloat(viewBox[4]);
  if (!(width > 0) || !(height > 0)) {
    return null;
  }

  const definitions = new Map<string, string>();
  for (const match of svg.matchAll(CLIP_PATH_DEF_RE)) {
    definitions.set(match[1], match[2]);
  }

  for (const id of referenced) {
    const body = definitions.get(id);
    // A dangling reference (no matching <clipPath>) is a broken export; dropping it
    // can only help, since the element renders as nothing either way.
    if (body === undefined) {
      continue;
    }
    if (!coversCanvas(body, width, height)) {
      return null;
    }
  }

  return svg.replace(CLIP_PATH_REF_RE, "");
};
