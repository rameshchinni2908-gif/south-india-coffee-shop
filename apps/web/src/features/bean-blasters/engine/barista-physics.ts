/**
 * Barista movement for Bean Blasters.
 *
 * A pure fixed-timestep integrator. `stepBarista` reads a state and writes a
 * state; when the caller supplies `out` (which may be the same object) the step
 * performs zero allocations, which is what the render loop relies on.
 *
 * Handling model, all constants from the contract:
 * - omnidirectional: the input vector is a direction, not a steering command;
 * - the velocity is pulled toward `direction * maxSpeed * magnitude` at
 *   `acceleration`, and bled off at `friction` when the thumb lets go;
 * - the movement velocity is hard-clamped to `maxSpeed` — a splash's knockback
 *   is carried as a *separate* vector so being hit can shove you faster than
 *   you can run, without the movement model ever exceeding its own limit;
 * - collision against the wall band and cover pushes the body out and cancels
 *   only the velocity component going into the surface, so you slide along
 *   crates instead of sticking to them.
 *
 * `aim` is deliberately NOT touched here. Facing is independent of movement
 * (BEAN-BLASTERS.md §3a) — strafing while shooting is the core skill, so the
 * physics has no opinion about where you are looking.
 */

import { BARISTA } from "../arena-contract.js";
import { resolveCirclePosition, type ArenaGeometry } from "./arena-geometry.js";
import { createVector, length, type Vector2 } from "./math.js";

export interface BaristaState {
  x: number;
  y: number;
  /** Movement velocity, world units per second. Never longer than `maxSpeed`. */
  vx: number;
  vy: number;
  /** Facing, in radians. Owned by the aim stick, never by this module. */
  aim: number;
  /** Impulse from a splash, decaying at `knockbackDecay`. Additive to `v`. */
  knockbackX: number;
  knockbackY: number;
}

export interface BaristaInput {
  /** Desired direction. Magnitude 0..1 scales the target speed. */
  moveX: number;
  moveY: number;
}

/**
 * Scratch vectors owned by the physics module. `stepBarista` is called from the
 * render loop, so it must not allocate; these are the only two vectors it uses.
 */
const resolved: Vector2 = createVector();

export const createBaristaState = (x: number, y: number, aim = 0): BaristaState => ({
  x,
  y,
  vx: 0,
  vy: 0,
  aim,
  knockbackX: 0,
  knockbackY: 0,
});

export const createBaristaInput = (): BaristaInput => ({ moveX: 0, moveY: 0 });

export const copyBaristaState = (source: BaristaState, target: BaristaState): BaristaState => {
  target.x = source.x;
  target.y = source.y;
  target.vx = source.vx;
  target.vy = source.vy;
  target.aim = source.aim;
  target.knockbackX = source.knockbackX;
  target.knockbackY = source.knockbackY;
  return target;
};

/** Current movement speed, ignoring knockback. */
export const baristaSpeed = (state: BaristaState): number => length(state.vx, state.vy);

/**
 * Writes a thumb-stick vector into an input, clamping its magnitude to 1 so a
 * diagonal is never faster than a cardinal — the classic twin-stick bug.
 */
export const setBaristaInput = (input: BaristaInput, dx: number, dy: number): BaristaInput => {
  const magnitude = length(dx, dy);
  if (magnitude <= 1) {
    input.moveX = dx;
    input.moveY = dy;
    return input;
  }
  input.moveX = dx / magnitude;
  input.moveY = dy / magnitude;
  return input;
};

/**
 * Adds a knockback impulse along `angle`. Only ever called from the server's
 * hit verdict — the engine never decides it took a splash.
 */
export const applyKnockback = (
  state: BaristaState,
  angle: number,
  speed: number = BARISTA.knockbackSpeed,
): void => {
  state.knockbackX += Math.cos(angle) * speed;
  state.knockbackY += Math.sin(angle) * speed;
};

/** How far the body may travel between collision resolutions. */
const SUBSTEP_DISTANCE = BARISTA.radius * 0.5;
/** A stalled phone must not turn one frame into a hundred collision passes. */
const MAX_SUBSTEPS = 8;

/**
 * Advances one barista by `dtSeconds`.
 *
 * Pure with respect to everything outside `out`: pass no `out` and you get a
 * fresh state back, pass the input state as `out` for an in-place step.
 */
export const stepBarista = (
  state: BaristaState,
  input: BaristaInput,
  dtSeconds: number,
  geometry: ArenaGeometry,
  out?: BaristaState,
): BaristaState => {
  const result = out ?? createBaristaState(0, 0, 0);

  // Read everything up front so `out === state` is safe.
  let x = state.x;
  let y = state.y;
  let vx = state.vx;
  let vy = state.vy;
  let knockbackX = state.knockbackX;
  let knockbackY = state.knockbackY;

  // --- movement velocity ---------------------------------------------------
  const inputMagnitude = length(input.moveX, input.moveY);

  if (inputMagnitude > 1e-6) {
    const scale = inputMagnitude > 1 ? 1 / inputMagnitude : 1;
    const targetVx = input.moveX * scale * BARISTA.maxSpeed;
    const targetVy = input.moveY * scale * BARISTA.maxSpeed;
    const deltaX = targetVx - vx;
    const deltaY = targetVy - vy;
    const delta = length(deltaX, deltaY);
    const step = BARISTA.acceleration * dtSeconds;
    if (delta <= step || delta <= 1e-9) {
      vx = targetVx;
      vy = targetVy;
    } else {
      vx += (deltaX / delta) * step;
      vy += (deltaY / delta) * step;
    }
  } else {
    const speed = length(vx, vy);
    const drop = BARISTA.friction * dtSeconds;
    if (speed <= drop) {
      vx = 0;
      vy = 0;
    } else {
      const kept = (speed - drop) / speed;
      vx *= kept;
      vy *= kept;
    }
  }

  // Belt and braces: the model above cannot overshoot, but a server correction
  // could have written a wild velocity in, and maxSpeed is a promised bound.
  const speed = length(vx, vy);
  if (speed > BARISTA.maxSpeed) {
    const kept = BARISTA.maxSpeed / speed;
    vx *= kept;
    vy *= kept;
  }

  // --- knockback -----------------------------------------------------------
  const knockback = length(knockbackX, knockbackY);
  if (knockback > 0) {
    const drop = BARISTA.knockbackDecay * dtSeconds;
    if (knockback <= drop) {
      knockbackX = 0;
      knockbackY = 0;
    } else {
      const kept = (knockback - drop) / knockback;
      knockbackX *= kept;
      knockbackY *= kept;
    }
  }

  // --- integrate, resolving collisions as we go ----------------------------
  // Swept in substeps rather than one jump so nothing can pass through a crate
  // however fast it is travelling — a knocked-back barista moves faster than
  // the movement model alone ever would.
  const moveX = (vx + knockbackX) * dtSeconds;
  const moveY = (vy + knockbackY) * dtSeconds;
  const distance = length(moveX, moveY);
  const substeps = Math.min(Math.max(Math.ceil(distance / SUBSTEP_DISTANCE), 1), MAX_SUBSTEPS);
  const stepX = moveX / substeps;
  const stepY = moveY / substeps;

  for (let i = 0; i < substeps; i += 1) {
    x += stepX;
    y += stepY;
    if (!resolveCirclePosition(geometry, x, y, BARISTA.radius, resolved)) continue;

    const correctionX = resolved.x - x;
    const correctionY = resolved.y - y;
    x = resolved.x;
    y = resolved.y;

    const correction = length(correctionX, correctionY);
    if (correction <= 1e-9) continue;

    // Cancel only the component heading into the surface, so contact slides.
    const normalX = correctionX / correction;
    const normalY = correctionY / correction;
    const intoSurface = vx * normalX + vy * normalY;
    if (intoSurface < 0) {
      vx -= normalX * intoSurface;
      vy -= normalY * intoSurface;
    }
    const knockbackInto = knockbackX * normalX + knockbackY * normalY;
    if (knockbackInto < 0) {
      knockbackX -= normalX * knockbackInto;
      knockbackY -= normalY * knockbackInto;
    }
  }

  result.x = x;
  result.y = y;
  result.vx = vx;
  result.vy = vy;
  result.aim = state.aim;
  result.knockbackX = knockbackX;
  result.knockbackY = knockbackY;
  return result;
};
