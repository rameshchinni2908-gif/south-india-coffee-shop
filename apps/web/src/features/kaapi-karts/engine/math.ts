/**
 * Tiny numeric helpers shared by the Kaapi Karts engine modules.
 *
 * Deliberately allocation-free: every function returns a primitive so the
 * per-frame hot path never creates garbage.
 */

export const TAU = Math.PI * 2;

export const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

/** Wraps an angle into (-PI, PI]. */
export const normaliseAngle = (angle: number): number => {
  let wrapped = angle % TAU;
  if (wrapped > Math.PI) wrapped -= TAU;
  else if (wrapped <= -Math.PI) wrapped += TAU;
  return wrapped;
};

/** Shortest signed rotation that takes `from` to `to`. */
export const angleDifference = (from: number, to: number): number => normaliseAngle(to - from);

/** Interpolates the short way round the circle. */
export const angleLerp = (from: number, to: number, t: number): number =>
  normaliseAngle(from + angleDifference(from, to) * t);

/**
 * Frame-rate independent exponential approach factor.
 * `rate` is the "units per second" pull strength.
 */
export const approachFactor = (rate: number, dtSeconds: number): number =>
  1 - Math.exp(-rate * dtSeconds);

/** Reads a typed-array slot with a numeric fallback (noUncheckedIndexedAccess). */
export const readNumber = (values: Float64Array, index: number): number => values[index] ?? 0;
