/**
 * Arena geometry for Bean Blasters.
 *
 * Turns the contract's `ArenaDefinition` into the handful of queries the
 * simulation asks every step:
 *
 * - "am I inside a wall or a crate, and where should I be pushed to?"
 * - "does this bean's flight segment hit cover before it reaches anyone?"
 * - "where may the camera sit without showing the outside of the arena?"
 *
 * The arena is a walled axis-aligned rectangle with axis-aligned cover, which
 * is why every test below is a rect test. That is a deliberate departure from
 * the kart game's spline world (BEAN-BLASTERS.md §3a): positioning and
 * line-of-sight are the skill here, so the world shape is chosen to make both
 * exact and cheap.
 *
 * Pure module: no DOM, no framework, no globals. Every query writes into a
 * caller-owned `out` or returns a primitive, so the hot path allocates nothing.
 */

import type { ArenaDefinition } from "../arena-contract.js";
import { clamp, setVector, type Vector2 } from "./math.js";

/** An axis-aligned rectangle stored as its two corners, ready for slab tests. */
export interface ArenaRect {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface ArenaGeometry {
  readonly arena: ArenaDefinition;
  /** Playable interior, i.e. the bounds minus the solid wall band. */
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly obstacles: readonly ArenaRect[];
}

/** No hit. Returned instead of null so the caller never branches on an object. */
export const NO_HIT = -1;

const EPSILON = 1e-9;

export const createRect = (x: number, y: number, width: number, height: number): ArenaRect => ({
  x1: x,
  y1: y,
  x2: x + width,
  y2: y + height,
});

export const buildArenaGeometry = (arena: ArenaDefinition): ArenaGeometry => {
  const obstacles: ArenaRect[] = [];
  for (let i = 0; i < arena.obstacles.length; i += 1) {
    const obstacle = arena.obstacles[i];
    if (!obstacle) continue;
    obstacles.push(createRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height));
  }

  return {
    arena,
    minX: arena.wallInset,
    minY: arena.wallInset,
    maxX: arena.width - arena.wallInset,
    maxY: arena.height - arena.wallInset,
    obstacles,
  };
};

const geometryCache = new Map<string, ArenaGeometry>();

/** Memoised geometry, keyed by arena id. */
export const getArenaGeometry = (arena: ArenaDefinition): ArenaGeometry => {
  const cached = geometryCache.get(arena.id);
  if (cached) return cached;
  const built = buildArenaGeometry(arena);
  geometryCache.set(arena.id, built);
  return built;
};

// ---------------------------------------------------------------------------
// Point / circle tests
// ---------------------------------------------------------------------------

export const rectContainsPoint = (rect: ArenaRect, x: number, y: number): boolean =>
  x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2;

export const circleOverlapsRect = (
  cx: number,
  cy: number,
  radius: number,
  rect: ArenaRect,
): boolean => {
  const closestX = clamp(cx, rect.x1, rect.x2);
  const closestY = clamp(cy, rect.y1, rect.y2);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius;
};

/**
 * Pushes a circle out of one rectangle by the shortest route, writing the
 * corrected centre into `out`. Returns false (and leaves `out` alone) when the
 * circle was already clear.
 *
 * Handles the degenerate case of a centre *inside* the rectangle by ejecting
 * along the shallowest face. That should be unreachable at these speeds, but a
 * teleporting respawn or a server correction can drop a barista anywhere.
 */
export const pushCircleOutOfRect = (
  cx: number,
  cy: number,
  radius: number,
  rect: ArenaRect,
  out: Vector2,
): boolean => {
  const closestX = clamp(cx, rect.x1, rect.x2);
  const closestY = clamp(cy, rect.y1, rect.y2);
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared >= radius * radius) return false;

  if (distanceSquared > EPSILON) {
    const distance = Math.sqrt(distanceSquared);
    const push = radius - distance;
    setVector(out, cx + (dx / distance) * push, cy + (dy / distance) * push);
    return true;
  }

  const left = cx - rect.x1;
  const right = rect.x2 - cx;
  const top = cy - rect.y1;
  const bottom = rect.y2 - cy;
  const shallowest = Math.min(left, right, top, bottom);

  if (shallowest === left) setVector(out, rect.x1 - radius, cy);
  else if (shallowest === right) setVector(out, rect.x2 + radius, cy);
  else if (shallowest === top) setVector(out, cx, rect.y1 - radius);
  else setVector(out, cx, rect.y2 + radius);
  return true;
};

/**
 * Resolves a circle against the wall band and every obstacle, writing the legal
 * centre into `out`. Returns true when anything moved.
 *
 * Two passes: pushing out of one crate can bury the circle in the wall it was
 * pinned against, and the second pass settles that corner.
 */
export const resolveCirclePosition = (
  geometry: ArenaGeometry,
  x: number,
  y: number,
  radius: number,
  out: Vector2,
): boolean => {
  let currentX = x;
  let currentY = y;
  let moved = false;

  for (let pass = 0; pass < 2; pass += 1) {
    const clampedX = clamp(currentX, geometry.minX + radius, geometry.maxX - radius);
    const clampedY = clamp(currentY, geometry.minY + radius, geometry.maxY - radius);
    if (clampedX !== currentX || clampedY !== currentY) {
      currentX = clampedX;
      currentY = clampedY;
      moved = true;
    }

    let touched = false;
    for (let i = 0; i < geometry.obstacles.length; i += 1) {
      const rect = geometry.obstacles[i];
      if (!rect) continue;
      if (pushCircleOutOfRect(currentX, currentY, radius, rect, out)) {
        currentX = out.x;
        currentY = out.y;
        touched = true;
        moved = true;
      }
    }
    if (!touched) break;
  }

  setVector(out, currentX, currentY);
  return moved;
};

/** True when a circle of `radius` at `(x, y)` sits inside the arena and clear of cover. */
export const isCircleClear = (
  geometry: ArenaGeometry,
  x: number,
  y: number,
  radius: number,
): boolean => {
  if (
    x - radius < geometry.minX ||
    x + radius > geometry.maxX ||
    y - radius < geometry.minY ||
    y + radius > geometry.maxY
  ) {
    return false;
  }
  for (let i = 0; i < geometry.obstacles.length; i += 1) {
    const rect = geometry.obstacles[i];
    if (!rect) continue;
    if (circleOverlapsRect(x, y, radius, rect)) return false;
  }
  return true;
};

// ---------------------------------------------------------------------------
// Segment tests — the reason a fast bean cannot tunnel thin cover
// ---------------------------------------------------------------------------

/**
 * Slab test. Returns the parametric distance along the segment at which it
 * first enters `rect`, or `NO_HIT`. A segment starting inside returns 0.
 */
export const segmentRectHit = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: ArenaRect,
): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) < EPSILON) {
    if (x1 < rect.x1 || x1 > rect.x2) return NO_HIT;
  } else {
    let near = (rect.x1 - x1) / dx;
    let far = (rect.x2 - x1) / dx;
    if (near > far) {
      const swap = near;
      near = far;
      far = swap;
    }
    if (near > tMin) tMin = near;
    if (far < tMax) tMax = far;
    if (tMin > tMax) return NO_HIT;
  }

  if (Math.abs(dy) < EPSILON) {
    if (y1 < rect.y1 || y1 > rect.y2) return NO_HIT;
  } else {
    let near = (rect.y1 - y1) / dy;
    let far = (rect.y2 - y1) / dy;
    if (near > far) {
      const swap = near;
      near = far;
      far = swap;
    }
    if (near > tMin) tMin = near;
    if (far < tMax) tMax = far;
    if (tMin > tMax) return NO_HIT;
  }

  return tMin;
};

/**
 * First parametric distance at which the segment touches the circle, or
 * `NO_HIT`. A segment starting inside the circle returns 0.
 */
export const segmentCircleHit = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  radius: number,
): number => {
  const fx = x1 - cx;
  const fy = y1 - cy;
  const radiusSquared = radius * radius;
  if (fx * fx + fy * fy <= radiusSquared) return 0;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const a = dx * dx + dy * dy;
  if (a <= EPSILON) return NO_HIT;

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radiusSquared;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return NO_HIT;

  const root = Math.sqrt(discriminant);
  const near = (-b - root) / (2 * a);
  if (near >= 0 && near <= 1) return near;
  const far = (-b + root) / (2 * a);
  if (far >= 0 && far <= 1) return far;
  return NO_HIT;
};

/**
 * First parametric distance at which the segment leaves the playable interior,
 * i.e. buries itself in the wall band, or `NO_HIT`.
 */
export const segmentWallHit = (
  geometry: ArenaGeometry,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number => {
  const inside =
    x1 >= geometry.minX && x1 <= geometry.maxX && y1 >= geometry.minY && y1 <= geometry.maxY;
  if (!inside) return 0;

  const dx = x2 - x1;
  const dy = y2 - y1;
  let t = NO_HIT;

  if (dx > EPSILON) t = (geometry.maxX - x1) / dx;
  else if (dx < -EPSILON) t = (geometry.minX - x1) / dx;

  if (dy > EPSILON) {
    const candidate = (geometry.maxY - y1) / dy;
    if (t === NO_HIT || candidate < t) t = candidate;
  } else if (dy < -EPSILON) {
    const candidate = (geometry.minY - y1) / dy;
    if (t === NO_HIT || candidate < t) t = candidate;
  }

  if (t === NO_HIT || t > 1) return NO_HIT;
  return t < 0 ? 0 : t;
};

/**
 * First parametric distance at which the segment is stopped by the arena — the
 * wall band or any piece of cover — or `NO_HIT` when the whole segment is
 * clear. This is what makes cover real (BEAN-BLASTERS.md §7a).
 */
export const segmentArenaHit = (
  geometry: ArenaGeometry,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number => {
  let best = segmentWallHit(geometry, x1, y1, x2, y2);

  for (let i = 0; i < geometry.obstacles.length; i += 1) {
    const rect = geometry.obstacles[i];
    if (!rect) continue;
    const hit = segmentRectHit(x1, y1, x2, y2, rect);
    if (hit === NO_HIT) continue;
    if (best === NO_HIT || hit < best) best = hit;
  }

  return best;
};

/** Nothing solid between the two points. */
export const hasLineOfSight = (
  geometry: ArenaGeometry,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean => segmentArenaHit(geometry, x1, y1, x2, y2) === NO_HIT;

// ---------------------------------------------------------------------------
// Spawn points and power-up pads
// ---------------------------------------------------------------------------

export const spawnPoint = (geometry: ArenaGeometry, index: number, out: Vector2): Vector2 => {
  const points = geometry.arena.spawnPoints;
  const point = points[((index % points.length) + points.length) % points.length];
  return setVector(out, point?.x ?? geometry.minX, point?.y ?? geometry.minY);
};

export const padPoint = (geometry: ArenaGeometry, index: number, out: Vector2): Vector2 => {
  const points = geometry.arena.padPoints;
  const point = points[index];
  return setVector(out, point?.x ?? geometry.minX, point?.y ?? geometry.minY);
};

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/**
 * Keeps the camera centre inside the arena bounds so the view never shows the
 * outside of the wall. When the view is wider than the arena on an axis the
 * arena is centred on that axis instead, which is the only sane answer.
 *
 * The kart game cannot do this because its viewport rotates with the kart; a
 * rotated rectangle does not map onto an axis-aligned one. Here the camera
 * never rotates (BEAN-BLASTERS.md §3a), so the clamp is exact.
 */
export const clampCamera = (
  geometry: ArenaGeometry,
  x: number,
  y: number,
  viewWidth: number,
  viewHeight: number,
  out: Vector2,
): Vector2 => {
  const arena = geometry.arena;
  const halfWidth = viewWidth / 2;
  const halfHeight = viewHeight / 2;

  const clampedX =
    viewWidth >= arena.width ? arena.width / 2 : clamp(x, halfWidth, arena.width - halfWidth);
  const clampedY =
    viewHeight >= arena.height ? arena.height / 2 : clamp(y, halfHeight, arena.height - halfHeight);

  return setVector(out, clampedX, clampedY);
};
