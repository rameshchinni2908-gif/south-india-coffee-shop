/**
 * Kart physics for Kaapi Karts.
 *
 * A pure fixed-timestep integrator. `stepKart` reads a state and writes a
 * state; when the caller supplies `out` (which may be the same object) the
 * step performs zero allocations, which is what the render loop relies on.
 *
 * Handling model, all constants from the contract:
 * - auto-accelerate toward `maxSpeed` (`boostSpeed` while boosting)
 * - `braking` while the brake is held, `drag` while coasting above target
 * - steering authority falls from `turnRate` to `turnRate * highSpeedTurnFactor`
 * - the velocity direction is pulled toward the heading at `grip` (light drift)
 * - off the tarmac, speed is clamped to `maxSpeed * offTrackSpeedFactor`
 * - boost pads grant `boostDurationMs`, then `boostCooldownMs` before the next
 * - a rubber-band multiplier scales the speed target
 */

import { KART, RUBBER_BAND, type BoostPad, type TrackDefinition } from "../game-contract.js";
import { angleLerp, approachFactor, clamp } from "./math.js";
import {
  closestPointOnTrack,
  createTrackSample,
  isOnTrack,
  type TrackGeometry,
  type TrackSample,
} from "./track-geometry.js";

/** How close the kart's centre must get to a pad to trigger it. */
export const BOOST_PAD_PICKUP_RADIUS = KART.radius + 24;

/** Below this speed the kart cannot pivot on the spot. */
const STEERING_AUTHORITY_SPEED = 8;

/** Keeps a spun-off kart inside the world box. */
const WORLD_MARGIN = 40;

export interface KartState {
  x: number;
  y: number;
  /** Where the kart points, in radians. */
  heading: number;
  /** Where the kart actually travels; lags `heading` by `grip`. */
  velocityHeading: number;
  /** World units per second, never negative. */
  speed: number;
  /** Arc length from the start/finish line. */
  distanceAlong: number;
  lateralOffset: number;
  onTrack: boolean;
  boostMsRemaining: number;
  /** Time until another pad can be picked up. Includes the boost itself. */
  boostCooldownMsRemaining: number;
}

export interface KartInput {
  steer: -1 | 0 | 1;
  braking: boolean;
}

export interface PhysicsContext {
  readonly geometry: TrackGeometry;
  readonly track: TrackDefinition;
  readonly boostPads: readonly BoostPad[];
  /** Speed-target multiplier from the rubber band. 1 is neutral. */
  rubberBand: number;
  /** Scratch sample reused every step so the hot path allocates nothing. */
  readonly sample: TrackSample;
}

export const createKartInput = (): KartInput => ({ steer: 0, braking: false });

export const createPhysicsContext = (
  track: TrackDefinition,
  geometry: TrackGeometry,
): PhysicsContext => ({
  geometry,
  track,
  boostPads: track.boostPads,
  rubberBand: 1,
  sample: createTrackSample(),
});

export const createKartState = (
  x: number,
  y: number,
  heading: number,
  distanceAlong: number,
): KartState => ({
  x,
  y,
  heading,
  velocityHeading: heading,
  speed: 0,
  distanceAlong,
  lateralOffset: 0,
  onTrack: true,
  boostMsRemaining: 0,
  boostCooldownMsRemaining: 0,
});

export const copyKartState = (source: KartState, target: KartState): KartState => {
  target.x = source.x;
  target.y = source.y;
  target.heading = source.heading;
  target.velocityHeading = source.velocityHeading;
  target.speed = source.speed;
  target.distanceAlong = source.distanceAlong;
  target.lateralOffset = source.lateralOffset;
  target.onTrack = source.onTrack;
  target.boostMsRemaining = source.boostMsRemaining;
  target.boostCooldownMsRemaining = source.boostCooldownMsRemaining;
  return target;
};

export const isBoostReady = (state: KartState): boolean =>
  state.boostCooldownMsRemaining <= 0 && state.boostMsRemaining <= 0;

/**
 * Speed multiplier for a 1-based race position: the leader is nudged down to
 * `RUBBER_BAND.maxPenalty`, the tail is pulled up to `RUBBER_BAND.maxBoost`.
 */
export const rubberBandMultiplier = (position: number, fieldSize: number): number => {
  if (fieldSize <= 1) return 1;
  const t = clamp((position - 1) / (fieldSize - 1), 0, 1);
  return RUBBER_BAND.maxPenalty + (RUBBER_BAND.maxBoost - RUBBER_BAND.maxPenalty) * t;
};

/** Steering authority at a given speed, in radians per second. */
export const steeringRateAt = (speed: number): number => {
  const speedRatio = clamp(speed / KART.maxSpeed, 0, 1);
  const scale = 1 + (KART.highSpeedTurnFactor - 1) * speedRatio;
  const authority = clamp(speed / STEERING_AUTHORITY_SPEED, 0, 1);
  return KART.turnRate * scale * authority;
};

const nearestPadIndex = (context: PhysicsContext, x: number, y: number): number => {
  const pads = context.boostPads;
  const limit = BOOST_PAD_PICKUP_RADIUS * BOOST_PAD_PICKUP_RADIUS;
  for (let i = 0; i < pads.length; i += 1) {
    const pad = pads[i];
    if (!pad) continue;
    const dx = pad.x - x;
    const dy = pad.y - y;
    if (dx * dx + dy * dy <= limit) return i;
  }
  return -1;
};

/**
 * Advances one kart by `dtSeconds`.
 *
 * Pure with respect to everything outside `out`: pass no `out` and you get a
 * fresh state back, pass the input state as `out` for an in-place step.
 */
export const stepKart = (
  state: KartState,
  input: KartInput,
  dtSeconds: number,
  context: PhysicsContext,
  out?: KartState,
): KartState => {
  const result = out ?? createKartState(0, 0, 0, 0);
  const dtMs = dtSeconds * 1000;

  // Read everything up front so `out === state` is safe.
  let heading = state.heading;
  let velocityHeading = state.velocityHeading;
  let speed = state.speed;
  let x = state.x;
  let y = state.y;
  let boostMsRemaining = Math.max(state.boostMsRemaining - dtMs, 0);
  let boostCooldownMsRemaining = Math.max(state.boostCooldownMsRemaining - dtMs, 0);

  // --- steering -----------------------------------------------------------
  heading += input.steer * steeringRateAt(speed) * dtSeconds;

  // --- longitudinal -------------------------------------------------------
  const boosting = boostMsRemaining > 0;
  const rubberBand = context.rubberBand > 0 ? context.rubberBand : 1;
  const target = (boosting ? KART.boostSpeed : KART.maxSpeed) * rubberBand;

  if (input.braking) {
    speed = Math.max(speed - KART.braking * dtSeconds, 0);
  } else if (speed < target) {
    speed = Math.min(speed + KART.acceleration * dtSeconds, target);
  } else {
    speed = Math.max(speed - KART.drag * dtSeconds, target);
  }

  const offTrackCap = KART.maxSpeed * KART.offTrackSpeedFactor;
  if (!state.onTrack && speed > offTrackCap) speed = offTrackCap;

  // --- drift: the velocity chases the heading ------------------------------
  velocityHeading = angleLerp(velocityHeading, heading, approachFactor(KART.grip, dtSeconds));

  // --- integrate ----------------------------------------------------------
  x += Math.cos(velocityHeading) * speed * dtSeconds;
  y += Math.sin(velocityHeading) * speed * dtSeconds;
  x = clamp(x, -WORLD_MARGIN, context.track.width + WORLD_MARGIN);
  y = clamp(y, -WORLD_MARGIN, context.track.height + WORLD_MARGIN);

  // --- resample the track --------------------------------------------------
  const sample = closestPointOnTrack(context.geometry, x, y, context.sample);
  const onTrack = isOnTrack(context.geometry, sample.lateralOffset);
  if (!onTrack && speed > offTrackCap) speed = offTrackCap;

  // --- boost pads ----------------------------------------------------------
  if (boostCooldownMsRemaining <= 0 && boostMsRemaining <= 0) {
    if (nearestPadIndex(context, x, y) >= 0) {
      boostMsRemaining = KART.boostDurationMs;
      boostCooldownMsRemaining = KART.boostDurationMs + KART.boostCooldownMs;
    }
  }

  result.x = x;
  result.y = y;
  result.heading = heading;
  result.velocityHeading = velocityHeading;
  result.speed = speed;
  result.distanceAlong = sample.distanceAlong;
  result.lateralOffset = sample.lateralOffset;
  result.onTrack = onTrack;
  result.boostMsRemaining = boostMsRemaining;
  result.boostCooldownMsRemaining = boostCooldownMsRemaining;
  return result;
};
