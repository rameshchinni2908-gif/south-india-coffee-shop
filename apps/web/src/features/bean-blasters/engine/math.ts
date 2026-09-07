/**
 * Tiny numeric helpers shared by the Bean Blasters engine modules.
 *
 * Deliberately allocation-free: every function either returns a primitive or
 * writes into a caller-owned `out`, so the per-frame hot path never creates
 * garbage.
 *
 * This mirrors the Kaapi Karts helper of the same name on purpose. The two
 * games share no code (BEAN-BLASTERS.md §3.3) so either can be deleted whole.
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

/** Vector length. Kept as two scalars so no object is needed to ask. */
export const length = (x: number, y: number): number => Math.sqrt(x * x + y * y);

export const lengthSquared = (x: number, y: number): number => x * x + y * y;

export interface Vector2 {
  x: number;
  y: number;
}

export const createVector = (x = 0, y = 0): Vector2 => ({ x, y });

export const setVector = (out: Vector2, x: number, y: number): Vector2 => {
  out.x = x;
  out.y = y;
  return out;
};

/**
 * Unit vector of `(x, y)` written into `out`. A zero-length input yields the
 * zero vector rather than NaN, because a released thumb stick is the common
 * case and must not poison the physics.
 */
export const normalise = (x: number, y: number, out: Vector2): Vector2 => {
  const len = length(x, y);
  if (len <= 1e-9) return setVector(out, 0, 0);
  return setVector(out, x / len, y / len);
};

/** Reads an array slot with a numeric fallback (noUncheckedIndexedAccess). */
export const readNumber = (values: ArrayLike<number>, index: number): number => values[index] ?? 0;
