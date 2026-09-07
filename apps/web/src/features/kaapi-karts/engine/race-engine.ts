/**
 * The Kaapi Karts race engine.
 *
 * Framework-free orchestrator: a fixed 60 Hz simulation with render
 * interpolation on top of a `requestAnimationFrame` loop, a follow camera, a
 * device-pixel-ratio ladder for weak phones, and throttled callbacks out to
 * whatever UI is hosting it.
 *
 * Design notes:
 * - the per-frame hot path allocates nothing: every vector, sample and kart
 *   state is created once at construction and mutated in place;
 * - `canvas.getContext("2d")` returning null (jsdom) is a supported case — the
 *   simulation still runs, only the drawing is skipped, so all of this stays
 *   unit-testable;
 * - wall-clock timing is anchored once against `startAtEpochMs` and then
 *   driven by the monotonic clock, so a mid-race clock adjustment cannot
 *   rewind the race.
 */

import {
  POSITION_BROADCAST_INTERVAL_MS,
  RACE_CAP_MS,
  RAM,
  TOTAL_LAPS,
  type TrackDefinition,
} from "../game-contract.js";
import {
  copyKartState,
  createKartInput,
  createKartState,
  createPhysicsContext,
  isBoostReady,
  rubberBandMultiplier,
  stepKart,
} from "./kart-physics.js";
import { drawKart, GHOST_ALPHA, SELF_ALPHA, type KartRenderOptions } from "./kart-renderer.js";
import { advanceLapTracker, createLapTracker } from "./lap-tracker.js";
import { angleLerp, approachFactor, clamp, lerp } from "./math.js";
import {
  closestPointOnTrack,
  createTrackSample,
  getTrackGeometry,
  gridStartDistance,
  gridStartPose,
} from "./track-geometry.js";
import { createTrackRenderer, TRACK_PALETTE } from "./track-renderer.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SelfSnapshot {
  x: number;
  y: number;
  heading: number;
  /** 0-based laps completed. */
  lap: number;
  /** Fractional laps travelled, 0..TOTAL_LAPS. */
  progress: number;
  speed: number;
  boostReady: boolean;
  boosting: boolean;
}

export interface GhostState {
  carNumber: number;
  colour: string;
  x: number;
  y: number;
  heading: number;
  lap: number;
  progress: number;
}

export interface RaceHud {
  lap: number;
  elapsedMs: number;
  speed: number;
  boostReady: boolean;
  boosting: boolean;
  position: number;
}

export interface RaceEngineOptions {
  canvas: HTMLCanvasElement;
  track: TrackDefinition;
  selfCarNumber: number;
  /** Hex colour for the player's kart. */
  selfColour: string;
  /** 0-based starting grid position. */
  gridSlot: number;
  reducedMotion: boolean;
  onLap: (lap: number, lapMs: number) => void;
  onFinish: (finishMs: number, lapSplits: number[]) => void;
  /** Throttled to POSITION_BROADCAST_INTERVAL_MS. */
  onBroadcast: (snapshot: SelfSnapshot) => void;
  onHud: (hud: RaceHud) => void;
}

export interface RaceEngine {
  /** Begin the RAF loop immediately; karts are frozen until `startAtEpochMs`. */
  mount(startAtEpochMs: number): void;
  setSteering(direction: -1 | 0 | 1): void;
  setBraking(isBraking: boolean): void;
  upsertGhost(ghost: GhostState): void;
  removeGhost(carNumber: number): void;
  getSnapshot(): SelfSnapshot;
  /** Force-end (race cap hit). Fires onFinish only if not already finished. */
  /** Applies the server's ram verdict: reward if we were the aggressor. */
  applyContact(isDasher: boolean): void;
  forceFinish(): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** 60 Hz simulation. */
export const FIXED_STEP_MS = 1000 / 60;
const FIXED_STEP_SECONDS = FIXED_STEP_MS / 1000;
/** Never spiral: a long stall is dropped rather than simulated in full. */
const MAX_STEPS_PER_FRAME = 5;
const MAX_FRAME_DELTA_MS = 100;

/** KAAPI-KARTS.md §13: cap the backing store at 2x. */
export const MAX_DEVICE_PIXEL_RATIO = 2;
/** Drop a rung when the average frame time exceeds this for a second. */
export const FRAME_BUDGET_MS = 22;
const QUALITY_SAMPLE_MS = 1000;

/**
 * Minimum world units the camera keeps in view, so corners arrive readable.
 * Widened after playtesting: the first pass framed the kart too tightly to read
 * where the next corner went.
 */
const VIEW_WIDTH = 700;
const VIEW_HEIGHT = 1010;
/** Push the camera ahead of the kart, as a share of the visible height. */
const CAMERA_LOOK_AHEAD = 0.16;
const CAMERA_FOLLOW_RATE = 9;
/**
 * How fast the view swings round to the kart's heading. The camera turns with
 * the kart so the track always runs away "up" the screen, which is what makes
 * left mean left: with a fixed camera, steering reads as inverted whenever you
 * are driving back down the screen.
 */
const CAMERA_TURN_RATE = 4.5;
const GHOST_SMOOTH_RATE = 12;

const HUD_INTERVAL_MS = 100;

const FALLBACK_CANVAS_WIDTH = 360;
const FALLBACK_CANVAS_HEIGHT = 640;

interface GhostRuntime {
  carNumber: number;
  colour: string;
  lap: number;
  progress: number;
  /** Rendered pose, smoothed toward the last packet. */
  x: number;
  y: number;
  heading: number;
  targetX: number;
  targetY: number;
  targetHeading: number;
}

const nowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const resolveContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
  try {
    return canvas.getContext("2d");
  } catch {
    // jsdom without `canvas` installed throws rather than returning null.
    return null;
  }
};

const devicePixelRatioOrOne = (): number =>
  typeof window !== "undefined" && typeof window.devicePixelRatio === "number"
    ? window.devicePixelRatio
    : 1;

export const createRaceEngine = (options: RaceEngineOptions): RaceEngine => {
  const { canvas, track, onLap, onFinish, onBroadcast, onHud } = options;

  const geometry = getTrackGeometry(track);
  const context = createPhysicsContext(track, geometry);
  const trackRenderer = createTrackRenderer(geometry, track);
  const ctx = resolveContext(canvas);

  // --- simulation state (all allocated once) -------------------------------
  const startPose = gridStartPose(geometry, options.gridSlot);
  const startDistance = gridStartDistance(geometry, options.gridSlot);
  const self = createKartState(startPose.x, startPose.y, startPose.heading, startDistance);
  const previous = createKartState(startPose.x, startPose.y, startPose.heading, startDistance);
  {
    // Seed the lateral offset / on-track flag from the real grid position.
    const seed = closestPointOnTrack(geometry, self.x, self.y, createTrackSample());
    self.lateralOffset = seed.lateralOffset;
    previous.lateralOffset = seed.lateralOffset;
  }
  const input = createKartInput();
  const tracker = createLapTracker(geometry.length, startDistance, TOTAL_LAPS);
  /** Lookup for updates; `ghostList` is what the hot path iterates (no iterators). */
  const ghosts = new Map<number, GhostRuntime>();
  const ghostList: GhostRuntime[] = [];
  const kartDraw: KartRenderOptions = {
    x: 0,
    y: 0,
    heading: 0,
    colour: options.selfColour,
    carNumber: options.selfCarNumber,
    alpha: SELF_ALPHA,
    boosting: false,
    worldRotation: 0,
  };

  // --- timing --------------------------------------------------------------
  let mounted = false;
  let destroyed = false;
  let finished = false;
  let rafId = 0;
  let elapsedBaseMs = 0;
  let perfAtMountMs = 0;
  let lastFrameMs = 0;
  let accumulatorMs = 0;
  let paused = false;

  // --- derived / throttled -------------------------------------------------
  let racePosition = 1;
  let fieldSize = 1;
  let lastBroadcastMs = -Infinity;
  let lastHudMs = -Infinity;

  // --- camera & quality ----------------------------------------------------
  let cameraX = self.x;
  let cameraY = self.y;
  let cameraHeading = self.heading;
  let cameraReady = false;
  let cssWidth = FALLBACK_CANVAS_WIDTH;
  let cssHeight = FALLBACK_CANVAS_HEIGHT;
  let pixelRatio = Math.min(devicePixelRatioOrOne(), MAX_DEVICE_PIXEL_RATIO);
  let qualityRung = 0;
  let qualityWindowMs = 0;
  let qualityFrames = 0;
  let qualityTotalMs = 0;
  let needsResize = true;

  const qualityLadder: number[] = [
    Math.min(devicePixelRatioOrOne(), MAX_DEVICE_PIXEL_RATIO),
    Math.min(devicePixelRatioOrOne(), 1.5),
    1,
  ];

  const elapsedAt = (perfNow: number): number => elapsedBaseMs + (perfNow - perfAtMountMs);

  // -------------------------------------------------------------------------
  // Canvas sizing
  // -------------------------------------------------------------------------

  const applyCanvasSize = (): void => {
    const rectWidth = canvas.clientWidth || canvas.width || FALLBACK_CANVAS_WIDTH;
    const rectHeight = canvas.clientHeight || canvas.height || FALLBACK_CANVAS_HEIGHT;
    cssWidth = Math.max(rectWidth, 1);
    cssHeight = Math.max(rectHeight, 1);
    pixelRatio = qualityLadder[qualityRung] ?? 1;
    const backingWidth = Math.round(cssWidth * pixelRatio);
    const backingHeight = Math.round(cssHeight * pixelRatio);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    needsResize = false;
  };

  const requestResize = (): void => {
    needsResize = true;
  };

  // -------------------------------------------------------------------------
  // Race position + rubber band
  // -------------------------------------------------------------------------

  const refreshRacePosition = (): void => {
    let ahead = 0;
    for (let i = 0; i < ghostList.length; i += 1) {
      const ghost = ghostList[i];
      if (ghost && ghost.progress > tracker.progress) ahead += 1;
    }
    racePosition = ahead + 1;
    fieldSize = ghostList.length + 1;
    context.rubberBand = rubberBandMultiplier(racePosition, fieldSize);
  };

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  const simulate = (elapsedMs: number): void => {
    copyKartState(self, previous);
    stepKart(self, input, FIXED_STEP_SECONDS, context, self);

    const tick = advanceLapTracker(tracker, self.distanceAlong, elapsedMs);
    if (tick === "none") return;

    onLap(tracker.lapsCompleted, tracker.lastLapMs);
    if (tick === "finish" && !finished) {
      finished = true;
      onFinish(tracker.finishMs ?? elapsedMs, tracker.lapSplits.slice());
    }
  };

  const smoothGhosts = (dtSeconds: number): void => {
    if (ghostList.length === 0) return;
    const factor = options.reducedMotion ? 1 : approachFactor(GHOST_SMOOTH_RATE, dtSeconds);
    for (let i = 0; i < ghostList.length; i += 1) {
      const ghost = ghostList[i];
      if (!ghost) continue;
      ghost.x = lerp(ghost.x, ghost.targetX, factor);
      ghost.y = lerp(ghost.y, ghost.targetY, factor);
      ghost.heading = angleLerp(ghost.heading, ghost.targetHeading, factor);
    }
  };

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  const updateCamera = (renderX: number, renderY: number, heading: number, dt: number): void => {
    const scale = Math.min(cssWidth / VIEW_WIDTH, cssHeight / VIEW_HEIGHT);
    const visibleHeight = cssHeight / scale;
    const lookAhead = visibleHeight * CAMERA_LOOK_AHEAD;

    // The view turns with the kart, so it is never clamped to the track bounds:
    // a rotated viewport does not map onto an axis-aligned rectangle, and the
    // kart is always on the ribbon anyway.
    const targetX = renderX + Math.cos(heading) * lookAhead;
    const targetY = renderY + Math.sin(heading) * lookAhead;

    if (!cameraReady) {
      cameraX = targetX;
      cameraY = targetY;
      cameraHeading = heading;
      cameraReady = true;
      return;
    }

    const factor = approachFactor(CAMERA_FOLLOW_RATE, dt);
    cameraX = lerp(cameraX, targetX, factor);
    cameraY = lerp(cameraY, targetY, factor);
    cameraHeading = angleLerp(cameraHeading, heading, approachFactor(CAMERA_TURN_RATE, dt));
  };

  const render = (alpha: number, timeMs: number, dtSeconds: number): void => {
    if (!ctx) return;
    if (needsResize) applyCanvasSize();

    const renderX = lerp(previous.x, self.x, alpha);
    const renderY = lerp(previous.y, self.y, alpha);
    const renderHeading = angleLerp(previous.heading, self.heading, alpha);
    updateCamera(renderX, renderY, renderHeading, dtSeconds);

    const scale = Math.min(cssWidth / VIEW_WIDTH, cssHeight / VIEW_HEIGHT);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = TRACK_PALETTE.ground;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Heading 0 points along +x, and the screen's "up" is -y, so turning the
    // world by this much puts the kart's nose at the top of the canvas.
    const worldRotation = -cameraHeading - Math.PI / 2;

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.translate(cssWidth / 2, cssHeight / 2);
    ctx.scale(scale, scale);
    ctx.rotate(worldRotation);
    ctx.translate(-cameraX, -cameraY);

    kartDraw.worldRotation = worldRotation;

    trackRenderer.draw(ctx, timeMs, options.reducedMotion);

    kartDraw.alpha = GHOST_ALPHA;
    kartDraw.boosting = false;
    for (let i = 0; i < ghostList.length; i += 1) {
      const ghost = ghostList[i];
      if (!ghost) continue;
      kartDraw.x = ghost.x;
      kartDraw.y = ghost.y;
      kartDraw.heading = ghost.heading;
      kartDraw.colour = ghost.colour;
      kartDraw.carNumber = ghost.carNumber;
      drawKart(ctx, kartDraw);
    }

    kartDraw.x = renderX;
    kartDraw.y = renderY;
    kartDraw.heading = renderHeading;
    kartDraw.colour = options.selfColour;
    kartDraw.carNumber = options.selfCarNumber;
    kartDraw.alpha = SELF_ALPHA;
    kartDraw.boosting = self.boostMsRemaining > 0;
    drawKart(ctx, kartDraw);
  };

  // -------------------------------------------------------------------------
  // Adaptive quality
  // -------------------------------------------------------------------------

  const sampleQuality = (frameMs: number): void => {
    if (qualityRung >= qualityLadder.length - 1) return;
    qualityFrames += 1;
    qualityTotalMs += frameMs;
    qualityWindowMs += frameMs;
    if (qualityWindowMs < QUALITY_SAMPLE_MS) return;

    const average = qualityTotalMs / Math.max(qualityFrames, 1);
    qualityWindowMs = 0;
    qualityFrames = 0;
    qualityTotalMs = 0;
    if (average > FRAME_BUDGET_MS) {
      qualityRung += 1;
      requestResize();
    }
  };

  // -------------------------------------------------------------------------
  // Callbacks
  // -------------------------------------------------------------------------

  const buildSnapshot = (): SelfSnapshot => ({
    x: self.x,
    y: self.y,
    heading: self.heading,
    lap: tracker.lapsCompleted,
    progress: tracker.progress,
    speed: self.speed,
    boostReady: isBoostReady(self),
    boosting: self.boostMsRemaining > 0,
  });

  const emitBroadcast = (perfNow: number): void => {
    if (perfNow - lastBroadcastMs < POSITION_BROADCAST_INTERVAL_MS) return;
    lastBroadcastMs = perfNow;
    onBroadcast(buildSnapshot());
  };

  const emitHud = (perfNow: number, elapsedMs: number): void => {
    if (perfNow - lastHudMs < HUD_INTERVAL_MS) return;
    lastHudMs = perfNow;
    refreshRacePosition();
    onHud({
      lap: tracker.lapsCompleted,
      elapsedMs: Math.max(elapsedMs, 0),
      speed: self.speed,
      boostReady: isBoostReady(self),
      boosting: self.boostMsRemaining > 0,
      position: racePosition,
    });
  };

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------

  const frame = (): void => {
    if (destroyed) return;
    rafId = requestAnimationFrame(frame);

    const perfNow = nowMs();
    const rawDelta = perfNow - lastFrameMs;
    lastFrameMs = perfNow;
    const frameMs = clamp(rawDelta, 0, MAX_FRAME_DELTA_MS);
    sampleQuality(frameMs);

    const elapsedMs = elapsedAt(perfNow);

    if (elapsedMs >= 0) {
      accumulatorMs += frameMs;
      let steps = 0;
      while (accumulatorMs >= FIXED_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
        simulate(elapsedMs);
        accumulatorMs -= FIXED_STEP_MS;
        steps += 1;
      }
      if (steps === MAX_STEPS_PER_FRAME) accumulatorMs = 0;
    } else {
      // Frozen on the grid: keep the interpolation source pinned.
      copyKartState(self, previous);
      accumulatorMs = 0;
    }

    smoothGhosts(frameMs / 1000);
    render(clamp(accumulatorMs / FIXED_STEP_MS, 0, 1), perfNow, frameMs / 1000);
    emitHud(perfNow, elapsedMs);
    if (elapsedMs >= 0) emitBroadcast(perfNow);

    if (!finished && elapsedMs >= RACE_CAP_MS) forceFinish();
  };

  const startLoop = (): void => {
    if (destroyed || paused) return;
    if (typeof requestAnimationFrame !== "function") return;
    if (rafId !== 0) return;
    lastFrameMs = nowMs();
    rafId = requestAnimationFrame(frame);
  };

  const stopLoop = (): void => {
    if (rafId !== 0 && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
    rafId = 0;
  };

  // KAAPI-KARTS.md §13: never burn a phone's battery on a hidden tab.
  const handleVisibility = (): void => {
    if (typeof document === "undefined") return;
    if (document.hidden) {
      paused = true;
      stopLoop();
      return;
    }
    paused = false;
    accumulatorMs = 0;
    startLoop();
  };

  const listen = (): void => {
    if (typeof window !== "undefined") {
      window.addEventListener("resize", requestResize);
      window.addEventListener("orientationchange", requestResize);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }
  };

  const unlisten = (): void => {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", requestResize);
      window.removeEventListener("orientationchange", requestResize);
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibility);
    }
  };

  let resizeObserver: ResizeObserver | null = null;
  const observeCanvas = (): void => {
    if (typeof ResizeObserver !== "function") return;
    resizeObserver = new ResizeObserver(requestResize);
    resizeObserver.observe(canvas);
  };

  function forceFinish(): void {
    if (finished) return;
    finished = true;
    const elapsedMs = clamp(elapsedAt(nowMs()), 0, RACE_CAP_MS);
    tracker.finished = true;
    if (tracker.finishMs === null) tracker.finishMs = elapsedMs;
    onFinish(elapsedMs, tracker.lapSplits.slice());
  }

  return {
    mount(startAtEpochMs: number): void {
      if (destroyed) return;
      perfAtMountMs = nowMs();
      elapsedBaseMs = Date.now() - startAtEpochMs;
      accumulatorMs = 0;
      if (mounted) return;
      mounted = true;
      applyCanvasSize();
      listen();
      observeCanvas();
      startLoop();
    },

    setSteering(direction: -1 | 0 | 1): void {
      input.steer = direction;
    },

    setBraking(isBraking: boolean): void {
      input.braking = isBraking;
    },

    upsertGhost(ghost: GhostState): void {
      const existing = ghosts.get(ghost.carNumber);
      if (existing) {
        existing.colour = ghost.colour;
        existing.lap = ghost.lap;
        existing.progress = ghost.progress;
        existing.targetX = ghost.x;
        existing.targetY = ghost.y;
        existing.targetHeading = ghost.heading;
        return;
      }
      const created: GhostRuntime = {
        carNumber: ghost.carNumber,
        colour: ghost.colour,
        lap: ghost.lap,
        progress: ghost.progress,
        x: ghost.x,
        y: ghost.y,
        heading: ghost.heading,
        targetX: ghost.x,
        targetY: ghost.y,
        targetHeading: ghost.heading,
      };
      ghosts.set(ghost.carNumber, created);
      ghostList.push(created);
    },

    removeGhost(carNumber: number): void {
      const existing = ghosts.get(carNumber);
      if (!existing) return;
      ghosts.delete(carNumber);
      const index = ghostList.indexOf(existing);
      if (index >= 0) ghostList.splice(index, 1);
    },

    getSnapshot(): SelfSnapshot {
      return buildSnapshot();
    },

    forceFinish,
    applyContact(isDasher) {
      if (isDasher) {
        self.ramBoostMsRemaining = RAM.boostMs;
      } else {
        self.ramSlowMsRemaining = RAM.slowMs;
      }
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      unlisten();
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      ghosts.clear();
      ghostList.length = 0;
    },
  };
};
