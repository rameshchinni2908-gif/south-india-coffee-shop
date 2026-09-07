/**
 * Public surface of the Bean Blasters canvas engine.
 *
 * UI code should import from here and nowhere deeper — the internals below are
 * free to change as long as this stays stable.
 *
 * Nothing in this folder imports React, Socket.IO or MUI, and nothing in it
 * imports from `features/kaapi-karts/`. That is what lets either game be
 * deleted in one move (BEAN-BLASTERS.md §3).
 */

export {
  createBattleEngine,
  FIXED_STEP_MS,
  FRAME_BUDGET_MS,
  MAX_DEVICE_PIXEL_RATIO,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  type BattleEngine,
  type BattleEngineOptions,
  type BattleHud,
} from "./battle-engine.js";

export {
  buildArenaGeometry,
  circleOverlapsRect,
  clampCamera,
  createRect,
  getArenaGeometry,
  hasLineOfSight,
  isCircleClear,
  NO_HIT,
  padPoint,
  pushCircleOutOfRect,
  rectContainsPoint,
  resolveCirclePosition,
  segmentArenaHit,
  segmentCircleHit,
  segmentRectHit,
  segmentWallHit,
  spawnPoint,
  type ArenaGeometry,
  type ArenaRect,
} from "./arena-geometry.js";

export {
  applyKnockback,
  baristaSpeed,
  copyBaristaState,
  createBaristaInput,
  createBaristaState,
  setBaristaInput,
  stepBarista,
  type BaristaInput,
  type BaristaState,
} from "./barista-physics.js";

export { createBeanPool, DEFAULT_BEAN_CAPACITY, type Bean, type BeanPool } from "./bean-pool.js";

export {
  ARENA_PALETTE,
  createArenaRenderer,
  drawBean,
  type ArenaRenderer,
} from "./arena-renderer.js";

export {
  createBaristaRenderOptions,
  drawBarista,
  drawSplash,
  DOWNED_ALPHA,
  GHOST_ALPHA,
  SELF_ALPHA,
  type BaristaRenderOptions,
} from "./barista-renderer.js";

export {
  angleDifference,
  angleLerp,
  approachFactor,
  clamp,
  createVector,
  length,
  lerp,
  normalise,
  normaliseAngle,
  setVector,
  TAU,
  type Vector2,
} from "./math.js";
