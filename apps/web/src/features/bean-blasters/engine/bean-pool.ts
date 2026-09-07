/**
 * The local projectile pool for Bean Blasters.
 *
 * Every bean the client will ever draw is allocated once, here, at
 * construction. After that the pool performs **zero allocations**: acquiring is
 * a pop from a preallocated free-list, releasing is a push, and stepping is an
 * indexed loop that mutates in place. This is the single most important
 * property in the engine — beans are the most numerous thing on screen and a
 * per-bean allocation would drop frames on the mid-range Android the game is
 * tuned for (BEAN-BLASTERS.md §13).
 *
 * The pool is a *rendering* structure. It predicts the player's own throws so
 * they feel instant, and replays everyone else's from the server's `arena:shot`
 * broadcast — but it never decides a hit. The server owns that outright
 * (§7a), and the client only ever draws its verdict.
 *
 * `stepBeans` mirrors the server's stepper exactly, in the same order:
 * advance, expire on lifetime, then despawn on the wall or cover. Any drift
 * between the two would show up as a bean the shooter saw connect that the
 * scoreboard never counted, so there is a test pinning them together.
 */

import { BEAN } from "../arena-contract.js";
import { NO_HIT, segmentArenaHit, type ArenaGeometry } from "./arena-geometry.js";

export interface Bean {
  active: boolean;
  /** Monotonic acquisition order. Used to recycle the oldest when exhausted. */
  serial: number;
  /** Badge that threw it. -1 while free. */
  ownerBadge: number;
  x: number;
  y: number;
  /** Position at the start of the current step, for render interpolation. */
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  angle: number;
  ageMs: number;
  lifetimeMs: number;
}

export interface BeanPool {
  readonly capacity: number;
  /** Fixed-length backing array. Iterate it by index; never reallocated. */
  readonly beans: readonly Bean[];
  readonly activeCount: number;
  acquire(ownerBadge: number, x: number, y: number, angle: number): Bean;
  release(bean: Bean): void;
  releaseAll(): void;
  /** Advances every live bean and despawns on lifetime, wall or cover. */
  step(dtSeconds: number, geometry: ArenaGeometry): void;
}

/**
 * Six players, a six-bean clip and a triple shot is 108 beans in the air in the
 * theoretical worst case; 128 leaves headroom without the pool being large
 * enough to matter. Beans are ten numbers each — the whole pool is a few KB.
 */
export const DEFAULT_BEAN_CAPACITY = 128;

const createBean = (): Bean => ({
  active: false,
  serial: 0,
  ownerBadge: -1,
  x: 0,
  y: 0,
  previousX: 0,
  previousY: 0,
  vx: 0,
  vy: 0,
  angle: 0,
  ageMs: 0,
  lifetimeMs: 0,
});

export const createBeanPool = (capacity: number = DEFAULT_BEAN_CAPACITY): BeanPool => {
  const size = Math.max(1, Math.floor(capacity));
  const beans: Bean[] = new Array<Bean>(size);
  for (let i = 0; i < size; i += 1) beans[i] = createBean();

  /** Stack of free indices. Preallocated; only `freeTop` ever changes. */
  const free = new Int32Array(size);
  for (let i = 0; i < size; i += 1) free[i] = size - 1 - i;
  let freeTop = size;

  let activeCount = 0;
  let nextSerial = 1;

  const beanAt = (index: number): Bean => {
    const bean = beans[index];
    // Unreachable: the array is fixed-length and fully populated above. The
    // fallback exists only to satisfy noUncheckedIndexedAccess.
    return bean ?? createBean();
  };

  /** Index of the longest-lived live bean. Only reached when the pool is full. */
  const oldestIndex = (): number => {
    let best = 0;
    let bestSerial = Number.POSITIVE_INFINITY;
    for (let i = 0; i < size; i += 1) {
      const bean = beans[i];
      if (!bean || !bean.active) continue;
      if (bean.serial < bestSerial) {
        bestSerial = bean.serial;
        best = i;
      }
    }
    return best;
  };

  const releaseIndex = (index: number): void => {
    const bean = beanAt(index);
    if (!bean.active) return;
    bean.active = false;
    bean.ownerBadge = -1;
    activeCount -= 1;
    free[freeTop] = index;
    freeTop += 1;
  };

  return {
    capacity: size,
    beans,

    get activeCount(): number {
      return activeCount;
    },

    acquire(ownerBadge: number, x: number, y: number, angle: number): Bean {
      let index: number;
      if (freeTop > 0) {
        freeTop -= 1;
        index = free[freeTop] ?? 0;
      } else {
        // Exhausted: the oldest bean in the air is the least interesting one to
        // keep, so it gives up its slot rather than the throw being dropped.
        index = oldestIndex();
        releaseIndex(index);
        freeTop -= 1;
      }

      const bean = beanAt(index);
      bean.active = true;
      bean.serial = nextSerial;
      nextSerial += 1;
      bean.ownerBadge = ownerBadge;
      bean.x = x;
      bean.y = y;
      bean.previousX = x;
      bean.previousY = y;
      bean.vx = Math.cos(angle) * BEAN.speed;
      bean.vy = Math.sin(angle) * BEAN.speed;
      bean.angle = angle;
      bean.ageMs = 0;
      bean.lifetimeMs = BEAN.lifetimeMs;
      activeCount += 1;
      return bean;
    },

    release(bean: Bean): void {
      if (!bean.active) return;
      for (let i = 0; i < size; i += 1) {
        if (beans[i] === bean) {
          releaseIndex(i);
          return;
        }
      }
    },

    releaseAll(): void {
      for (let i = 0; i < size; i += 1) releaseIndex(i);
    },

    step(dtSeconds: number, geometry: ArenaGeometry): void {
      if (activeCount === 0) return;
      const dtMs = dtSeconds * 1000;

      for (let i = 0; i < size; i += 1) {
        const bean = beans[i];
        if (!bean || !bean.active) continue;

        const nextX = bean.x + bean.vx * dtSeconds;
        const nextY = bean.y + bean.vy * dtSeconds;

        // Order matters — it is the server's order (§7a).
        bean.ageMs += dtMs;
        if (bean.ageMs >= bean.lifetimeMs) {
          releaseIndex(i);
          continue;
        }

        // Swept as a segment, not a point, so a 520 u/s bean cannot step
        // straight through a thin crate between ticks.
        if (segmentArenaHit(geometry, bean.x, bean.y, nextX, nextY) !== NO_HIT) {
          releaseIndex(i);
          continue;
        }

        bean.previousX = bean.x;
        bean.previousY = bean.y;
        bean.x = nextX;
        bean.y = nextY;
      }
    },
  };
};
