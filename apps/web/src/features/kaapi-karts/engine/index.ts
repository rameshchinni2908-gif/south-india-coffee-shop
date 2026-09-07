/**
 * Public surface of the Kaapi Karts canvas engine.
 *
 * UI code should import from here and nowhere deeper — the internals below are
 * free to change as long as this stays stable.
 */

export {
  createRaceEngine,
  FIXED_STEP_MS,
  FRAME_BUDGET_MS,
  MAX_DEVICE_PIXEL_RATIO,
  type GhostState,
  type RaceEngine,
  type RaceEngineOptions,
  type RaceHud,
  type SelfSnapshot,
} from "./race-engine.js";

export {
  buildTrackGeometry,
  closestPointOnTrack,
  getTrackGeometry,
  gridStartDistance,
  gridStartPose,
  isOnTrack,
  poseAtDistance,
  wrapDistance,
  type TrackGeometry,
  type TrackPose,
  type TrackSample,
} from "./track-geometry.js";

export {
  createKartState,
  createPhysicsContext,
  isBoostReady,
  rubberBandMultiplier,
  steeringRateAt,
  stepKart,
  type KartInput,
  type KartState,
  type PhysicsContext,
} from "./kart-physics.js";

export {
  advanceLapTracker,
  createLapTracker,
  MIN_LAP_FRACTION,
  type LapTick,
  type LapTrackerState,
} from "./lap-tracker.js";

export { drawKart, GHOST_ALPHA, type KartRenderOptions } from "./kart-renderer.js";
export { createTrackRenderer, TRACK_PALETTE, type TrackRenderer } from "./track-renderer.js";
