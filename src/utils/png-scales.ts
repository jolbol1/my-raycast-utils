/** Keep in sync with the `defaultPngScale` preference and the `scale` argument in package.json. */
export const PNG_SCALES = [1, 2, 4, 8, 16, 32, 64] as const;

export const DEFAULT_PNG_SCALE = 4;

export const isValidScale = (scale: number): boolean => (PNG_SCALES as readonly number[]).includes(scale);

/** Parses a preference/argument value, falling back to the default when unset or invalid. */
export const parseScale = (value?: string): number => {
  const scale = Number.parseInt(value ?? "", 10);
  return Number.isFinite(scale) && isValidScale(scale) ? scale : DEFAULT_PNG_SCALE;
};

/** All scales, with the user's preferred one first so it becomes the primary action. */
export const preferredScaleOrder = (value?: string): number[] => {
  const preferred = parseScale(value);
  return [preferred, ...PNG_SCALES.filter((scale) => scale !== preferred)];
};
