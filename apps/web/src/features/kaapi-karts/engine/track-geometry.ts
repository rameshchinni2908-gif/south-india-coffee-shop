/**
 * Track geometry for Kaapi Karts.
 *
 * Expands the contract's control points with a centripetal Catmull-Rom spline
 * into a dense closed polyline, then answers the two questions the simulation
 * asks every step: "how far around am I?" and "how far off the racing surface
 * am I?".
 *
 * The polyline is rotated so that index 0 — and therefore `distanceAlong === 0`
 * — sits exactly on the start/finish line. Lap counting then reduces to
 * detecting a wrap of `distanceAlong`.
 *
 * Pure module: no DOM, no framework, no globals.
 */

import type { TrackDefinition, TrackPoint } from "../game-contract.js";
import { clamp, readNumber } from "./math.js";

/** Spline samples generated per control-point span. */
export const SAMPLES_PER_SEGMENT = 32;

/** Centripetal parameterisation. 0.5 avoids cusps and self-intersections. */
const CATMULL_ROM_ALPHA = 0.5;

const ORIGIN: TrackPoint = { x: 0, y: 0 };

export interface TrackSample {
  /** Arc length from the start/finish line to the closest centreline point. */
  distanceAlong: number;
  /** Signed distance from the centreline; positive is to the left of travel. */
  lateralOffset: number;
  /** Closest point on the centreline. */
  closestX: number;
  closestY: number;
  /** Centreline heading at that point, in radians. */
  heading: number;
}

export interface TrackPose {
  x: number;
  y: number;
  heading: number;
}

export const createTrackSample = (): TrackSample => ({
  distanceAlong: 0,
  lateralOffset: 0,
  closestX: 0,
  closestY: 0,
  heading: 0,
});

export const createTrackPose = (): TrackPose => ({ x: 0, y: 0, heading: 0 });

export interface TrackGeometry {
  readonly track: TrackDefinition;
  /** Number of polyline vertices. The loop closes from `count - 1` back to 0. */
  readonly count: number;
  /** Measured spline length in world units. */
  readonly length: number;
  readonly halfWidth: number;
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  /** `cumulative[i]` is the arc length at vertex `i`; `cumulative[count]` is the total. */
  readonly cumulative: Float64Array;
}

const wrapIndex = (index: number, count: number): number => ((index % count) + count) % count;

const controlPointAt = (points: readonly TrackPoint[], index: number): TrackPoint =>
  points[wrapIndex(index, points.length)] ?? ORIGIN;

/**
 * Rotates the control points so the start/finish control point leads, which
 * puts arc length zero on the start line.
 */
const orderControlPoints = (track: TrackDefinition): TrackPoint[] => {
  const source = track.controlPoints;
  const total = source.length;
  const ordered: TrackPoint[] = [];
  for (let i = 0; i < total; i += 1) {
    ordered.push(controlPointAt(source, track.startIndex + i));
  }
  return ordered;
};

const knotDelta = (a: TrackPoint, b: TrackPoint): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  // Guard coincident control points, which would divide by zero below.
  return Math.max(Math.pow(distance, CATMULL_ROM_ALPHA), 1e-6);
};

/**
 * Builds the dense polyline, arc-length table and derived metrics for a track.
 * Cheap enough to call in a test, but memoise it for the render loop.
 */
export const buildTrackGeometry = (track: TrackDefinition): TrackGeometry => {
  const ordered = orderControlPoints(track);
  const segments = ordered.length;
  const count = segments * SAMPLES_PER_SEGMENT;
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);

  let write = 0;
  for (let segment = 0; segment < segments; segment += 1) {
    const p0 = controlPointAt(ordered, segment - 1);
    const p1 = controlPointAt(ordered, segment);
    const p2 = controlPointAt(ordered, segment + 1);
    const p3 = controlPointAt(ordered, segment + 2);

    const t0 = 0;
    const t1 = t0 + knotDelta(p0, p1);
    const t2 = t1 + knotDelta(p1, p2);
    const t3 = t2 + knotDelta(p2, p3);

    for (let step = 0; step < SAMPLES_PER_SEGMENT; step += 1) {
      const t = t1 + ((t2 - t1) * step) / SAMPLES_PER_SEGMENT;

      const a1x = ((t1 - t) / (t1 - t0)) * p0.x + ((t - t0) / (t1 - t0)) * p1.x;
      const a1y = ((t1 - t) / (t1 - t0)) * p0.y + ((t - t0) / (t1 - t0)) * p1.y;
      const a2x = ((t2 - t) / (t2 - t1)) * p1.x + ((t - t1) / (t2 - t1)) * p2.x;
      const a2y = ((t2 - t) / (t2 - t1)) * p1.y + ((t - t1) / (t2 - t1)) * p2.y;
      const a3x = ((t3 - t) / (t3 - t2)) * p2.x + ((t - t2) / (t3 - t2)) * p3.x;
      const a3y = ((t3 - t) / (t3 - t2)) * p2.y + ((t - t2) / (t3 - t2)) * p3.y;

      const b1x = ((t2 - t) / (t2 - t0)) * a1x + ((t - t0) / (t2 - t0)) * a2x;
      const b1y = ((t2 - t) / (t2 - t0)) * a1y + ((t - t0) / (t2 - t0)) * a2y;
      const b2x = ((t3 - t) / (t3 - t1)) * a2x + ((t - t1) / (t3 - t1)) * a3x;
      const b2y = ((t3 - t) / (t3 - t1)) * a2y + ((t - t1) / (t3 - t1)) * a3y;

      xs[write] = ((t2 - t) / (t2 - t1)) * b1x + ((t - t1) / (t2 - t1)) * b2x;
      ys[write] = ((t2 - t) / (t2 - t1)) * b1y + ((t - t1) / (t2 - t1)) * b2y;
      write += 1;
    }
  }

  const cumulative = new Float64Array(count + 1);
  for (let i = 0; i < count; i += 1) {
    const next = i + 1 === count ? 0 : i + 1;
    const dx = readNumber(xs, next) - readNumber(xs, i);
    const dy = readNumber(ys, next) - readNumber(ys, i);
    cumulative[i + 1] = readNumber(cumulative, i) + Math.sqrt(dx * dx + dy * dy);
  }

  return {
    track,
    count,
    length: readNumber(cumulative, count),
    halfWidth: track.halfWidth,
    xs,
    ys,
    cumulative,
  };
};

const geometryCache = new Map<string, TrackGeometry>();

/** Memoised geometry, keyed by track id. */
export const getTrackGeometry = (track: TrackDefinition): TrackGeometry => {
  const cached = geometryCache.get(track.id);
  if (cached) return cached;
  const built = buildTrackGeometry(track);
  geometryCache.set(track.id, built);
  return built;
};

/** Wraps an arc length into [0, length). */
export const wrapDistance = (geometry: TrackGeometry, distance: number): number => {
  const total = geometry.length;
  if (total <= 0) return 0;
  const wrapped = distance % total;
  return wrapped < 0 ? wrapped + total : wrapped;
};

/**
 * Nearest point on the centreline to `(x, y)`.
 *
 * Writes into `out` when supplied so the simulation can run allocation-free.
 */
export const closestPointOnTrack = (
  geometry: TrackGeometry,
  x: number,
  y: number,
  out?: TrackSample,
): TrackSample => {
  const result = out ?? createTrackSample();
  const { xs, ys, cumulative, count } = geometry;

  let bestSquared = Number.POSITIVE_INFINITY;
  let bestIndex = 0;
  let bestT = 0;
  let bestX = 0;
  let bestY = 0;

  for (let i = 0; i < count; i += 1) {
    const next = i + 1 === count ? 0 : i + 1;
    const ax = readNumber(xs, i);
    const ay = readNumber(ys, i);
    const bx = readNumber(xs, next);
    const by = readNumber(ys, next);
    const ex = bx - ax;
    const ey = by - ay;
    const lengthSquared = ex * ex + ey * ey;
    if (lengthSquared <= 0) continue;

    let t = ((x - ax) * ex + (y - ay) * ey) / lengthSquared;
    t = clamp(t, 0, 1);
    const px = ax + ex * t;
    const py = ay + ey * t;
    const dx = x - px;
    const dy = y - py;
    const squared = dx * dx + dy * dy;

    if (squared < bestSquared) {
      bestSquared = squared;
      bestIndex = i;
      bestT = t;
      bestX = px;
      bestY = py;
    }
  }

  const next = bestIndex + 1 === count ? 0 : bestIndex + 1;
  const ax = readNumber(xs, bestIndex);
  const ay = readNumber(ys, bestIndex);
  const ex = readNumber(xs, next) - ax;
  const ey = readNumber(ys, next) - ay;
  const heading = Math.atan2(ey, ex);

  const segmentStart = readNumber(cumulative, bestIndex);
  const segmentEnd = readNumber(cumulative, bestIndex + 1);

  result.distanceAlong = segmentStart + (segmentEnd - segmentStart) * bestT;
  result.closestX = bestX;
  result.closestY = bestY;
  result.heading = heading;
  // Left of the direction of travel is positive.
  result.lateralOffset = (x - bestX) * -Math.sin(heading) + (y - bestY) * Math.cos(heading);
  return result;
};

/** A kart is on the tarmac while its lateral offset stays inside the ribbon. */
export const isOnTrack = (geometry: TrackGeometry, lateralOffset: number): boolean =>
  Math.abs(lateralOffset) <= geometry.halfWidth;

const vertexIndexForDistance = (geometry: TrackGeometry, distance: number): number => {
  const { cumulative, count } = geometry;
  let low = 0;
  let high = count;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (readNumber(cumulative, mid + 1) <= distance) low = mid + 1;
    else high = mid;
  }
  return Math.min(low, count - 1);
};

/** Centreline pose at an arc length. Wraps, so any distance is valid. */
export const poseAtDistance = (
  geometry: TrackGeometry,
  distance: number,
  out?: TrackPose,
): TrackPose => {
  const result = out ?? createTrackPose();
  const wrapped = wrapDistance(geometry, distance);
  const index = vertexIndexForDistance(geometry, wrapped);
  const next = index + 1 === geometry.count ? 0 : index + 1;

  const segmentStart = readNumber(geometry.cumulative, index);
  const segmentEnd = readNumber(geometry.cumulative, index + 1);
  const span = segmentEnd - segmentStart;
  const t = span > 0 ? clamp((wrapped - segmentStart) / span, 0, 1) : 0;

  const ax = readNumber(geometry.xs, index);
  const ay = readNumber(geometry.ys, index);
  const bx = readNumber(geometry.xs, next);
  const by = readNumber(geometry.ys, next);

  result.x = ax + (bx - ax) * t;
  result.y = ay + (by - ay) * t;
  result.heading = Math.atan2(by - ay, bx - ax);
  return result;
};

/** Grid rows of two, tucked in behind the start/finish line. */
const GRID_LATERAL_OFFSET = 24;
const GRID_FIRST_ROW_SETBACK = 30;
const GRID_ROW_SPACING = 54;

/** Arc length a kart sits at before lights-out for a 0-based grid slot. */
export const gridStartDistance = (geometry: TrackGeometry, slot: number): number => {
  const row = Math.floor(Math.max(slot, 0) / 2);
  const setback = GRID_FIRST_ROW_SETBACK + row * GRID_ROW_SPACING;
  return wrapDistance(geometry, geometry.length - setback);
};

/**
 * Starting pose for a 0-based grid slot. Slots alternate left/right of the
 * centreline and step back one row every two slots, so no two karts overlap.
 */
export const gridStartPose = (
  geometry: TrackGeometry,
  slot: number,
  out?: TrackPose,
): TrackPose => {
  const result = poseAtDistance(geometry, gridStartDistance(geometry, slot), out);
  const side = Math.max(slot, 0) % 2 === 0 ? -1 : 1;
  const offset = side * GRID_LATERAL_OFFSET;
  result.x += -Math.sin(result.heading) * offset;
  result.y += Math.cos(result.heading) * offset;
  return result;
};
