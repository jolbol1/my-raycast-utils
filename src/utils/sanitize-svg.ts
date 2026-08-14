/**
 * Raycast's image renderer does not resolve `clip-path="url(#…)"`. Anything wrapped
 * in one is clipped away entirely and the tile renders blank.
 *
 * In practice every clip path in the svgl library is a full-canvas rect (or the
 * equivalent `M0 0h{W}v{H}H0z` path) emitted by Figma/Illustrator, so dropping the
 * reference is visually a no-op. Clip paths that genuinely crop are left alone —
 * showing uncropped artwork would be worse than the status quo.
 */

const VIEW_BOX_RE = /viewBox\s*=\s*"\s*([-\d.eE]+)[,\s]+([-\d.eE]+)[,\s]+([-\d.eE]+)[,\s]+([-\d.eE]+)\s*"/;
const CLIP_PATH_REF_RE = /\sclip-path\s*=\s*"url\(#([^)"]+)\)"/g;
const CLIP_PATH_DEF_RE = /<clipPath[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/clipPath>/g;

/** A shape is treated as full-canvas if it covers at least this much of the viewBox. */
const COVERAGE_THRESHOLD = 0.9;

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
