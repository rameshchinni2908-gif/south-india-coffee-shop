/**
 * The Bean Blasters battle engine.
 *
 * Framework-free orchestrator: a fixed 60 Hz simulation with render
 * interpolation on top of a `requestAnimationFrame` loop, a fixed-orientation
 * follow camera clamped to the arena, a device-pixel-ratio ladder for weak
 * phones, and throttled callbacks out to whatever UI is hosting it.
 *
 * Design notes:
 * - the per-frame hot path allocates nothing: every vector, bean, ghost and
 *   splash decal is created once at construction and mutated in place. The only
 *   objects made after that are the throttled `onHud` / `onBroadcast` payloads,
 *   which React needs as fresh objects to re-render at all;
 * - `canvas.getContext("2d")` returning null (jsdom) is a supported case — the
 *   simulation still runs, only the drawing is skipped, so all of this stays
 *   unit-testable;
 * - wall-clock timing is anchored once against `startAtEpochMs` and then driven
 *   by the monotonic clock, so a mid-round clock adjustment cannot rewind the
 *   whistle;
 * - **the engine never decides a hit, a score or a heart change.** It predicts
 *   its own beans locally so throwing feels instant, but every heart, splash
 *   and respawn arrives from the server as a verdict and is obeyed without
 *   question (BEAN-BLASTERS.md §7a).
 *
 * The camera does NOT rotate and IS clamped, both deliberate departures from
 * the kart engine — see §3a. Aiming is absolute here, so a rotating view would
 * make the aim stick disagree with the screen every frame.
 */

import {
  BEAN,
  HEALTH,
  MAX_PLAYERS,
  POSITION_BROADCAST_INTERVAL_MS,
  POWER_UP,
  WEAPON,
  type ArenaDefinition,
  type ArenaGhostPayload,
  type ArenaHitPayload,
  type ArenaRespawnPayload,
  type ArenaShotPayload,
  type PowerUpKind,
} from "../arena-contract.js";
import { createArenaRenderer, ARENA_PALETTE, drawBean } from "./arena-renderer.js";
import { clampCamera, getArenaGeometry, spawnPoint, type ArenaGeometry } from "./arena-geometry.js";
import {
  createBaristaRenderOptions,
  drawBarista,
  drawSplash,
  GHOST_ALPHA,
  SELF_ALPHA,
} from "./barista-renderer.js";
import {
  applyKnockback,
  copyBaristaState,
  createBaristaInput,
  createBaristaState,
  setBaristaInput,
  stepBarista,
} from "./barista-physics.js";
import { createBeanPool, type BeanPool } from "./bean-pool.js";
import { angleLerp, approachFactor, clamp, createVector, lerp, type Vector2 } from "./math.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BattleHud {
  hearts: number;
  ammo: number;
  reloading: boolean;
  /** 0..1 sweep for the reload indicator. */
  reloadProgress: number;
  /** Time to the whistle, counting down. Never negative. */
  remainingMs: number;
  /** Splashes landed, as last told by the server. */
  hits: number;
  downed: boolean;
  powerUp: PowerUpKind | null;
  powerUpRemainingMs: number;
}

export interface BattleEngineOptions {
  canvas: HTMLCanvasElement;
  arena: ArenaDefinition;
  selfBadgeNumber: number;
  /** Hex colour for the player's barista. */
  selfColour: string;
  /** 0-based index into `arena.spawnPoints`. */
  spawnIndex: number;
  reducedMotion: boolean;
  /** One accepted trigger pull. The server validates it and owns every bean. */
  onFire: (payload: { x: number; y: number; angle: number }) => void;
  /** Throttled to POSITION_BROADCAST_INTERVAL_MS. Best-effort, untrusted. */
  onBroadcast: (pose: { x: number; y: number; aim: number }) => void;
  onHud: (hud: BattleHud) => void;
}

export interface BattleEngine {
  /** Begin the RAF loop immediately; the arena is frozen until `startAtEpochMs`. */
  mount(startAtEpochMs: number, endsAtEpochMs: number): void;
  setMove(dx: number, dy: number): void;
  setAim(angle: number): void;
  setFiring(isFiring: boolean): void;
  requestReload(): void;
  upsertGhost(ghost: ArenaGhostPayload & { colour: string }): void;
  removeGhost(badgeNumber: number): void;
  applyHit(payload: ArenaHitPayload): void;
  applyRespawn(payload: ArenaRespawnPayload): void;
  applyAmmo(ammo: number, reloadingUntilEpochMs: number | null): void;
  applyShot(payload: ArenaShotPayload): void;
  applyPad(padIndex: number, kind: PowerUpKind | null): void;
  applyPower(kind: PowerUpKind | null, untilEpochMs: number | null): void;
  getPose(): { x: number; y: number; aim: number };
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

/** BEAN-BLASTERS.md §13: cap the backing store at 2x. */
export const MAX_DEVICE_PIXEL_RATIO = 2;
/** Drop a rung when the average frame time exceeds this for a second. */
export const FRAME_BUDGET_MS = 22;
const QUALITY_SAMPLE_MS = 1000;

/**
 * Minimum world units the camera keeps in view. Wide enough to read a rival
 * leading you across the floor, tight enough that a barista is a real target on
 * a phone. Portrait-biased because the game does not force landscape (§13).
 */
export const VIEW_WIDTH = 620;
export const VIEW_HEIGHT = 900;
const CAMERA_FOLLOW_RATE = 11;
const GHOST_SMOOTH_RATE = 12;

const HUD_INTERVAL_MS = 100;

/** Screen shake on taking a splash. Skipped entirely under reduced motion (§9). */
const SHAKE_MS = 220;
const SHAKE_AMPLITUDE = 9;

const SPLASH_CAPACITY = 24;
const SPLASH_LIFETIME_MS = 1_400;
const SPLASH_RADIUS = 22;

/** Display window for an instant power-up (REFILL), which has no `until`. */
const INSTANT_POWER_FLASH_MS = 1_200;

const FALLBACK_CANVAS_WIDTH = 360;
const FALLBACK_CANVAS_HEIGHT = 640;

// ---------------------------------------------------------------------------
// Runtime records — all preallocated
// ---------------------------------------------------------------------------

interface GhostRuntime {
  active: boolean;
  badgeNumber: number;
  colour: string;
  hearts: number;
  downed: boolean;
  /** Rendered pose, smoothed toward the last packet. */
  x: number;
  y: number;
  aim: number;
  targetX: number;
  targetY: number;
  targetAim: number;
}

interface SplashRuntime {
  active: boolean;
  x: number;
  y: number;
  ageMs: number;
}

const createGhostRuntime = (): GhostRuntime => ({
  active: false,
  badgeNumber: -1,
  colour: "#6f3219",
  hearts: HEALTH.startHearts,
  downed: false,
  x: 0,
  y: 0,
  aim: 0,
  targetX: 0,
  targetY: 0,
  targetAim: 0,
});

const createSplashRuntime = (): SplashRuntime => ({ active: false, x: 0, y: 0, ageMs: 0 });

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

export const createBattleEngine = (options: BattleEngineOptions): BattleEngine => {
  const { canvas, onFire, onBroadcast, onHud } = options;

  const geometry: ArenaGeometry = getArenaGeometry(options.arena);
  const arenaRenderer = createArenaRenderer(geometry);
  const ctx = resolveContext(canvas);

  // --- simulation state (all allocated once) -------------------------------
  const spawn: Vector2 = createVector();
  spawnPoint(geometry, options.spawnIndex, spawn);
  const self = createBaristaState(spawn.x, spawn.y, Math.PI / 2);
  const previous = createBaristaState(spawn.x, spawn.y, Math.PI / 2);
  const input = createBaristaInput();
  const idleInput = createBaristaInput();
  const beans: BeanPool = createBeanPool();

  const ghosts: GhostRuntime[] = new Array<GhostRuntime>(MAX_PLAYERS);
  for (let i = 0; i < MAX_PLAYERS; i += 1) ghosts[i] = createGhostRuntime();

  const splashes: SplashRuntime[] = new Array<SplashRuntime>(SPLASH_CAPACITY);
  for (let i = 0; i < SPLASH_CAPACITY; i += 1) splashes[i] = createSplashRuntime();
  let splashCursor = 0;

  const pads: (PowerUpKind | null)[] = new Array<PowerUpKind | null>(
    options.arena.padPoints.length,
  );
  for (let i = 0; i < pads.length; i += 1) pads[i] = null;

  const baristaDraw = createBaristaRenderOptions(options.selfColour, options.selfBadgeNumber);
  const cameraTarget: Vector2 = createVector();

  // --- authoritative-ish player state --------------------------------------
  // Every field here is written by a server verdict, except `ammo`, which is
  // predicted locally for feel and corrected by `applyAmmo`.
  // Annotated as `number`, not left to inference: the contract is `as const`,
  // so `HEALTH.startHearts` is the literal type 3 and every later assignment
  // from a server verdict would be rejected.
  let hearts: number = HEALTH.startHearts;
  let hits = 0;
  let downed = false;
  let ammo: number = WEAPON.clipSize;
  let reloadingUntilEpochMs = 0;
  let reloadStartedEpochMs = 0;
  let powerUp: PowerUpKind | null = null;
  let powerUpUntilEpochMs = 0;

  // --- input ---------------------------------------------------------------
  let firing = false;
  let lastShotEpochMs = -Infinity;

  // --- timing --------------------------------------------------------------
  let mounted = false;
  let destroyed = false;
  let rafId = 0;
  let elapsedBaseMs = 0;
  let perfAtMountMs = 0;
  let lastFrameMs = 0;
  let accumulatorMs = 0;
  let paused = false;
  let roundStartEpochMs = 0;
  let roundDurationMs = 0;

  // --- throttles -----------------------------------------------------------
  let lastBroadcastMs = -Infinity;
  let lastHudMs = -Infinity;

  // --- camera & quality ----------------------------------------------------
  let cameraX = self.x;
  let cameraY = self.y;
  let cameraReady = false;
  let shakeMsRemaining = 0;
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

  /**
   * The server's clock, as best this phone knows it. Anchored to the round's
   * own start so it is monotonic — `Date.now()` is only the pre-mount fallback.
   */
  const epochNow = (): number => (mounted ? roundStartEpochMs + elapsedAt(nowMs()) : Date.now());

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
  // Ghosts and splashes
  // -------------------------------------------------------------------------

  const findGhost = (badgeNumber: number): GhostRuntime | null => {
    for (let i = 0; i < ghosts.length; i += 1) {
      const ghost = ghosts[i];
      if (ghost && ghost.active && ghost.badgeNumber === badgeNumber) return ghost;
    }
    return null;
  };

  const addSplash = (x: number, y: number): void => {
    if (options.reducedMotion) return;
    const splash = splashes[splashCursor];
    splashCursor = (splashCursor + 1) % SPLASH_CAPACITY;
    if (!splash) return;
    splash.active = true;
    splash.x = x;
    splash.y = y;
    splash.ageMs = 0;
  };

  const stepSplashes = (frameMs: number): void => {
    for (let i = 0; i < splashes.length; i += 1) {
      const splash = splashes[i];
      if (!splash || !splash.active) continue;
      splash.ageMs += frameMs;
      if (splash.ageMs >= SPLASH_LIFETIME_MS) splash.active = false;
    }
  };

  // -------------------------------------------------------------------------
  // Weapon
  // -------------------------------------------------------------------------

  const effectiveFireIntervalMs = (): number =>
    powerUp === "RAPID"
      ? WEAPON.fireIntervalMs * POWER_UP.rapid.fireIntervalFactor
      : WEAPON.fireIntervalMs;

  const isReloading = (epochMs: number): boolean => epochMs < reloadingUntilEpochMs;

  const settleReload = (epochMs: number): void => {
    if (reloadingUntilEpochMs === 0 || epochMs < reloadingUntilEpochMs) return;
    // Predicted completion. `applyAmmo` is the authority and will correct it.
    reloadingUntilEpochMs = 0;
    reloadStartedEpochMs = 0;
    ammo = WEAPON.clipSize;
  };

  const settlePowerUp = (epochMs: number): void => {
    if (powerUp === null) return;
    if (epochMs >= powerUpUntilEpochMs) {
      powerUp = null;
      powerUpUntilEpochMs = 0;
    }
  };

  const startReload = (epochMs: number): void => {
    if (isReloading(epochMs)) return;
    if (ammo >= WEAPON.clipSize) return;
    reloadStartedEpochMs = epochMs;
    reloadingUntilEpochMs = epochMs + WEAPON.reloadMs;
  };

  /**
   * Predicts one throw locally and tells the host to send it. The server may
   * still reject it (§7a) — in which case the predicted beans simply fly and
   * expire without ever having been able to score, which is exactly right.
   */
  const tryFire = (epochMs: number): void => {
    if (downed || firing === false) return;
    if (isReloading(epochMs) || ammo <= 0) return;
    if (epochMs - lastShotEpochMs < effectiveFireIntervalMs()) return;

    lastShotEpochMs = epochMs;
    ammo -= 1;
    onFire({ x: self.x, y: self.y, angle: self.aim });

    if (powerUp === "TRIPLE") {
      const spread = POWER_UP.triple.spreadRad;
      beans.acquire(options.selfBadgeNumber, self.x, self.y, self.aim - spread);
      beans.acquire(options.selfBadgeNumber, self.x, self.y, self.aim);
      beans.acquire(options.selfBadgeNumber, self.x, self.y, self.aim + spread);
    } else {
      beans.acquire(options.selfBadgeNumber, self.x, self.y, self.aim);
    }

    if (ammo === 0) startReload(epochMs);
  };

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  const simulate = (): void => {
    copyBaristaState(self, previous);
    // A downed barista stands still and stays a valid target (§5).
    stepBarista(self, downed ? idleInput : input, FIXED_STEP_SECONDS, geometry, self);
    beans.step(FIXED_STEP_SECONDS, geometry);
  };

  const smoothGhosts = (dtSeconds: number): void => {
    const factor = options.reducedMotion ? 1 : approachFactor(GHOST_SMOOTH_RATE, dtSeconds);
    for (let i = 0; i < ghosts.length; i += 1) {
      const ghost = ghosts[i];
      if (!ghost || !ghost.active) continue;
      ghost.x = lerp(ghost.x, ghost.targetX, factor);
      ghost.y = lerp(ghost.y, ghost.targetY, factor);
      ghost.aim = angleLerp(ghost.aim, ghost.targetAim, factor);
    }
  };

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  const updateCamera = (renderX: number, renderY: number, dtSeconds: number): void => {
    const scale = Math.min(cssWidth / VIEW_WIDTH, cssHeight / VIEW_HEIGHT);
    const visibleWidth = cssWidth / scale;
    const visibleHeight = cssHeight / scale;

    clampCamera(geometry, renderX, renderY, visibleWidth, visibleHeight, cameraTarget);

    if (!cameraReady) {
      cameraX = cameraTarget.x;
      cameraY = cameraTarget.y;
      cameraReady = true;
      return;
    }

    const factor = approachFactor(CAMERA_FOLLOW_RATE, dtSeconds);
    cameraX = lerp(cameraX, cameraTarget.x, factor);
    cameraY = lerp(cameraY, cameraTarget.y, factor);
  };

  const render = (alpha: number, timeMs: number, dtSeconds: number): void => {
    if (!ctx) return;
    if (needsResize) applyCanvasSize();

    const renderX = lerp(previous.x, self.x, alpha);
    const renderY = lerp(previous.y, self.y, alpha);
    updateCamera(renderX, renderY, dtSeconds);

    const scale = Math.min(cssWidth / VIEW_WIDTH, cssHeight / VIEW_HEIGHT);

    let shakeX = 0;
    let shakeY = 0;
    if (shakeMsRemaining > 0) {
      const strength = (shakeMsRemaining / SHAKE_MS) * SHAKE_AMPLITUDE;
      shakeX = Math.sin(timeMs / 11) * strength;
      shakeY = Math.cos(timeMs / 9) * strength;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = ARENA_PALETTE.ground;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // No rotation: aiming is absolute, so the world must stay put (§3a).
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.translate(cssWidth / 2 + shakeX, cssHeight / 2 + shakeY);
    ctx.scale(scale, scale);
    ctx.translate(-cameraX, -cameraY);

    arenaRenderer.draw(ctx, pads, timeMs, options.reducedMotion);

    for (let i = 0; i < splashes.length; i += 1) {
      const splash = splashes[i];
      if (!splash || !splash.active) continue;
      const life = 1 - splash.ageMs / SPLASH_LIFETIME_MS;
      drawSplash(ctx, splash.x, splash.y, SPLASH_RADIUS, life * 0.7);
    }

    const pool = beans.beans;
    for (let i = 0; i < pool.length; i += 1) {
      const bean = pool[i];
      if (!bean || !bean.active) continue;
      drawBean(
        ctx,
        lerp(bean.previousX, bean.x, alpha),
        lerp(bean.previousY, bean.y, alpha),
        BEAN.radius,
      );
    }

    baristaDraw.alpha = GHOST_ALPHA;
    baristaDraw.showAim = false;
    baristaDraw.shielded = false;
    for (let i = 0; i < ghosts.length; i += 1) {
      const ghost = ghosts[i];
      if (!ghost || !ghost.active) continue;
      baristaDraw.x = ghost.x;
      baristaDraw.y = ghost.y;
      baristaDraw.aim = ghost.aim;
      baristaDraw.colour = ghost.colour;
      baristaDraw.badgeNumber = ghost.badgeNumber;
      baristaDraw.hearts = ghost.hearts;
      baristaDraw.downed = ghost.downed;
      drawBarista(ctx, baristaDraw);
    }

    baristaDraw.x = renderX;
    baristaDraw.y = renderY;
    baristaDraw.aim = self.aim;
    baristaDraw.colour = options.selfColour;
    baristaDraw.badgeNumber = options.selfBadgeNumber;
    baristaDraw.alpha = SELF_ALPHA;
    baristaDraw.hearts = hearts;
    baristaDraw.downed = downed;
    baristaDraw.shielded = powerUp === "SHIELD";
    baristaDraw.showAim = true;
    drawBarista(ctx, baristaDraw);
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

  const emitBroadcast = (perfNow: number): void => {
    if (perfNow - lastBroadcastMs < POSITION_BROADCAST_INTERVAL_MS) return;
    lastBroadcastMs = perfNow;
    onBroadcast({ x: self.x, y: self.y, aim: self.aim });
  };

  const emitHud = (perfNow: number, elapsedMs: number, epochMs: number): void => {
    if (perfNow - lastHudMs < HUD_INTERVAL_MS) return;
    lastHudMs = perfNow;

    const reloading = isReloading(epochMs);
    const reloadSpan = reloadingUntilEpochMs - reloadStartedEpochMs;
    onHud({
      hearts,
      ammo,
      reloading,
      reloadProgress:
        reloading && reloadSpan > 0
          ? clamp((epochMs - reloadStartedEpochMs) / reloadSpan, 0, 1)
          : 0,
      remainingMs: clamp(roundDurationMs - Math.max(elapsedMs, 0), 0, roundDurationMs),
      hits,
      downed,
      powerUp,
      powerUpRemainingMs: powerUp === null ? 0 : Math.max(powerUpUntilEpochMs - epochMs, 0),
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
    const epochMs = roundStartEpochMs + elapsedMs;

    if (elapsedMs >= 0) {
      settleReload(epochMs);
      settlePowerUp(epochMs);
      tryFire(epochMs);

      accumulatorMs += frameMs;
      let steps = 0;
      while (accumulatorMs >= FIXED_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
        simulate();
        accumulatorMs -= FIXED_STEP_MS;
        steps += 1;
      }
      if (steps === MAX_STEPS_PER_FRAME) accumulatorMs = 0;
    } else {
      // Frozen for the countdown: keep the interpolation source pinned.
      copyBaristaState(self, previous);
      accumulatorMs = 0;
    }

    if (shakeMsRemaining > 0) shakeMsRemaining = Math.max(shakeMsRemaining - frameMs, 0);
    smoothGhosts(frameMs / 1000);
    stepSplashes(frameMs);
    render(clamp(accumulatorMs / FIXED_STEP_MS, 0, 1), perfNow, frameMs / 1000);
    emitHud(perfNow, elapsedMs, epochMs);
    if (elapsedMs >= 0) emitBroadcast(perfNow);
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

  // BEAN-BLASTERS.md §13: never burn a phone's battery on a hidden tab. The
  // barista stands still and stays a target while the tab is away (§5).
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

  return {
    mount(startAtEpochMs: number, endsAtEpochMs: number): void {
      if (destroyed) return;
      perfAtMountMs = nowMs();
      roundStartEpochMs = startAtEpochMs;
      roundDurationMs = Math.max(endsAtEpochMs - startAtEpochMs, 0);
      elapsedBaseMs = Date.now() - startAtEpochMs;
      accumulatorMs = 0;
      if (mounted) return;
      mounted = true;
      applyCanvasSize();
      listen();
      observeCanvas();
      startLoop();
    },

    setMove(dx: number, dy: number): void {
      setBaristaInput(input, dx, dy);
    },

    setAim(angle: number): void {
      // Facing is independent of movement: strafing preserves it (§3a).
      self.aim = angle;
      previous.aim = angle;
    },

    setFiring(isFiring: boolean): void {
      firing = isFiring;
    },

    requestReload(): void {
      startReload(epochNow());
    },

    upsertGhost(ghost: ArenaGhostPayload & { colour: string }): void {
      const existing = findGhost(ghost.badgeNumber);
      if (existing) {
        existing.colour = ghost.colour;
        existing.hearts = ghost.hearts;
        existing.downed = ghost.downed;
        existing.targetX = ghost.x;
        existing.targetY = ghost.y;
        existing.targetAim = ghost.aim;
        return;
      }

      for (let i = 0; i < ghosts.length; i += 1) {
        const slot = ghosts[i];
        if (!slot || slot.active) continue;
        slot.active = true;
        slot.badgeNumber = ghost.badgeNumber;
        slot.colour = ghost.colour;
        slot.hearts = ghost.hearts;
        slot.downed = ghost.downed;
        slot.x = ghost.x;
        slot.y = ghost.y;
        slot.aim = ghost.aim;
        slot.targetX = ghost.x;
        slot.targetY = ghost.y;
        slot.targetAim = ghost.aim;
        return;
      }
      // No free slot: the room is capped at MAX_PLAYERS, so this is unreachable.
    },

    removeGhost(badgeNumber: number): void {
      const ghost = findGhost(badgeNumber);
      if (!ghost) return;
      ghost.active = false;
      ghost.badgeNumber = -1;
    },

    applyHit(payload: ArenaHitPayload): void {
      addSplash(payload.x, payload.y);

      if (payload.victimBadge === options.selfBadgeNumber) {
        hearts = payload.victimHearts;
        downed = payload.downed;
        if (!payload.shielded) {
          // Shove along the bean's direction of travel. The verdict does not
          // carry that direction, but the bean came from the shooter, so the
          // line from their last known pose to ours is it. With no ghost for
          // the shooter (they have not broadcast yet) the shove is skipped
          // rather than guessed — a wrong shove reads worse than none.
          const shooter = findGhost(payload.shooterBadge);
          if (shooter) {
            applyKnockback(self, Math.atan2(self.y - shooter.y, self.x - shooter.x));
          }
          if (!options.reducedMotion) shakeMsRemaining = SHAKE_MS;
        }
      } else {
        const victim = findGhost(payload.victimBadge);
        if (victim) {
          victim.hearts = payload.victimHearts;
          victim.downed = payload.downed;
        }
      }

      // The server owns the scoreboard; this is only the local HUD's copy of it.
      if (payload.shooterBadge === options.selfBadgeNumber) hits += 1;
    },

    applyRespawn(payload: ArenaRespawnPayload): void {
      if (payload.badgeNumber === options.selfBadgeNumber) {
        self.x = payload.x;
        self.y = payload.y;
        self.vx = 0;
        self.vy = 0;
        self.knockbackX = 0;
        self.knockbackY = 0;
        copyBaristaState(self, previous);
        hearts = payload.hearts;
        downed = false;
        cameraReady = false;
        return;
      }

      const ghost = findGhost(payload.badgeNumber);
      if (!ghost) return;
      ghost.hearts = payload.hearts;
      ghost.downed = false;
      ghost.x = payload.x;
      ghost.y = payload.y;
      ghost.targetX = payload.x;
      ghost.targetY = payload.y;
    },

    applyAmmo(nextAmmo: number, reloadingUntilEpoch: number | null): void {
      ammo = Math.max(nextAmmo, 0);
      if (reloadingUntilEpoch === null) {
        reloadingUntilEpochMs = 0;
        reloadStartedEpochMs = 0;
        return;
      }
      reloadingUntilEpochMs = reloadingUntilEpoch;
      reloadStartedEpochMs = reloadingUntilEpoch - WEAPON.reloadMs;
    },

    applyShot(payload: ArenaShotPayload): void {
      // Our own shots were already predicted at the trigger pull; replaying the
      // server's echo would draw every bean twice.
      if (payload.badgeNumber === options.selfBadgeNumber) return;
      for (let i = 0; i < payload.angles.length; i += 1) {
        const angle = payload.angles[i];
        if (typeof angle !== "number") continue;
        beans.acquire(payload.badgeNumber, payload.x, payload.y, angle);
      }
    },

    applyPad(padIndex: number, kind: PowerUpKind | null): void {
      if (padIndex < 0 || padIndex >= pads.length) return;
      pads[padIndex] = kind;
    },

    applyPower(kind: PowerUpKind | null, untilEpochMs: number | null): void {
      if (kind === null) {
        powerUp = null;
        powerUpUntilEpochMs = 0;
        return;
      }
      powerUp = kind;
      // REFILL is instant and carries no `until`; hold the chip briefly so the
      // player sees what they picked up.
      powerUpUntilEpochMs = untilEpochMs ?? epochNow() + INSTANT_POWER_FLASH_MS;
    },

    getPose(): { x: number; y: number; aim: number } {
      return { x: self.x, y: self.y, aim: self.aim };
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
      beans.releaseAll();
      for (let i = 0; i < ghosts.length; i += 1) {
        const ghost = ghosts[i];
        if (ghost) ghost.active = false;
      }
      for (let i = 0; i < splashes.length; i += 1) {
        const splash = splashes[i];
        if (splash) splash.active = false;
      }
    },
  };
};
