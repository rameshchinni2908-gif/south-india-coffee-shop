import { describe, expect, it } from "vitest";

import {
  BARISTA,
  BEAN,
  MAX_PLAYERS,
  POWER_UP,
  ROASTERY_FLOOR,
  WEAPON,
  type ArenaDefinition,
} from "../src/features/bean-blasters/arena-contract.js";
import {
  applyKnockback,
  baristaSpeed,
  buildArenaGeometry,
  clampCamera,
  createBaristaInput,
  createBaristaState,
  createBattleEngine,
  createBeanPool,
  createVector,
  DEFAULT_BEAN_CAPACITY,
  hasLineOfSight,
  isCircleClear,
  NO_HIT,
  padPoint,
  segmentArenaHit,
  segmentCircleHit,
  segmentRectHit,
  setBaristaInput,
  spawnPoint,
  stepBarista,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  type ArenaGeometry,
  type BaristaInput,
  type BaristaState,
} from "../src/features/bean-blasters/engine/index.js";
import { length } from "../src/features/bean-blasters/engine/math.js";

const geometry = buildArenaGeometry(ROASTERY_FLOOR);
const STEP_SECONDS = 1 / 60;

/** An empty walled box, so movement tests are not perturbed by cover. */
const OPEN_ARENA: ArenaDefinition = { ...ROASTERY_FLOOR, id: "test-open", obstacles: [] };
const openGeometry = buildArenaGeometry(OPEN_ARENA);

const input = (dx: number, dy: number): BaristaInput =>
  setBaristaInput(createBaristaInput(), dx, dy);

const runBarista = (
  state: BaristaState,
  command: BaristaInput,
  steps: number,
  target: ArenaGeometry = openGeometry,
): BaristaState => {
  for (let i = 0; i < steps; i += 1) stepBarista(state, command, STEP_SECONDS, target, state);
  return state;
};

// ---------------------------------------------------------------------------
// arena-geometry
// ---------------------------------------------------------------------------

describe("arena geometry", () => {
  it("derives the playable interior from the wall band", () => {
    expect(geometry.minX).toBe(ROASTERY_FLOOR.wallInset);
    expect(geometry.minY).toBe(ROASTERY_FLOOR.wallInset);
    expect(geometry.maxX).toBe(ROASTERY_FLOOR.width - ROASTERY_FLOOR.wallInset);
    expect(geometry.maxY).toBe(ROASTERY_FLOOR.height - ROASTERY_FLOOR.wallInset);
    expect(geometry.obstacles).toHaveLength(ROASTERY_FLOOR.obstacles.length);
  });

  // BEAN-BLASTERS.md §20: "If you change the arena's obstacles, re-run the
  // engine test: it asserts that every spawn point is reachable and that no pad
  // is embedded in cover."
  it("keeps every spawn point clear of cover and inside the wall", () => {
    expect(ROASTERY_FLOOR.spawnPoints.length).toBeGreaterThanOrEqual(MAX_PLAYERS);

    const point = createVector();
    for (let i = 0; i < ROASTERY_FLOOR.spawnPoints.length; i += 1) {
      spawnPoint(geometry, i, point);
      expect(isCircleClear(geometry, point.x, point.y, BARISTA.radius)).toBe(true);
    }

    // And no two players start on top of each other.
    const a = createVector();
    const b = createVector();
    for (let i = 0; i < ROASTERY_FLOOR.spawnPoints.length; i += 1) {
      for (let j = i + 1; j < ROASTERY_FLOOR.spawnPoints.length; j += 1) {
        spawnPoint(geometry, i, a);
        spawnPoint(geometry, j, b);
        expect(length(a.x - b.x, a.y - b.y)).toBeGreaterThan(BARISTA.radius * 2);
      }
    }
  });

  it("keeps every power-up pad clear of cover and reachable", () => {
    const point = createVector();
    for (let i = 0; i < ROASTERY_FLOOR.padPoints.length; i += 1) {
      padPoint(geometry, i, point);
      // A barista must be able to stand on the pad to pick it up.
      expect(isCircleClear(geometry, point.x, point.y, BARISTA.radius)).toBe(true);
      expect(isCircleClear(geometry, point.x, point.y, POWER_UP.pickupRadius)).toBe(true);
    }
  });

  it("finds the first entry point of a segment into a rectangle", () => {
    const rect = { x1: 100, y1: 100, x2: 200, y2: 200 };

    // Straight through the middle: enters at x = 100, a quarter of the way.
    expect(segmentRectHit(0, 150, 400, 150, rect)).toBeCloseTo(0.25, 9);
    // Starting inside is an immediate hit.
    expect(segmentRectHit(150, 150, 400, 150, rect)).toBe(0);
    // Passing above it never touches.
    expect(segmentRectHit(0, 50, 400, 50, rect)).toBe(NO_HIT);
    // Stopping short never touches.
    expect(segmentRectHit(0, 150, 90, 150, rect)).toBe(NO_HIT);
  });

  it("finds the first entry point of a segment into a circle", () => {
    expect(segmentCircleHit(0, 0, 100, 0, 50, 0, 10)).toBeCloseTo(0.4, 9);
    expect(segmentCircleHit(50, 0, 100, 0, 50, 0, 10)).toBe(0);
    expect(segmentCircleHit(0, 40, 100, 40, 50, 0, 10)).toBe(NO_HIT);
  });

  it("stops a segment at the wall band", () => {
    // A short hop down a clear column of the floor reaches nothing solid.
    expect(segmentArenaHit(geometry, 550, 600, 550, 610)).toBe(NO_HIT);

    // The same column carried on into the bottom wall.
    const atWall = segmentArenaHit(geometry, 550, 600, 550, 2_000);
    expect(atWall).not.toBe(NO_HIT);
    expect(600 + atWall * (2_000 - 600)).toBeCloseTo(geometry.maxY, 6);
  });

  it("breaks line of sight through the centre block", () => {
    // The centre block spans x 700..900, y 540..660.
    expect(hasLineOfSight(geometry, 600, 600, 1_000, 600)).toBe(false);
    // A lane above it is clear.
    expect(hasLineOfSight(geometry, 600, 450, 1_000, 450)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// barista-physics
// ---------------------------------------------------------------------------

describe("barista physics", () => {
  it("reaches maxSpeed and never exceeds it, from any direction", () => {
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      const state = createBaristaState(800, 600, 0);
      const command = input(Math.cos(angle), Math.sin(angle));

      let peak = 0;
      for (let step = 0; step < 120; step += 1) {
        stepBarista(state, command, STEP_SECONDS, openGeometry, state);
        peak = Math.max(peak, baristaSpeed(state));
        expect(baristaSpeed(state)).toBeLessThanOrEqual(BARISTA.maxSpeed + 1e-9);
      }

      expect(peak).toBeCloseTo(BARISTA.maxSpeed, 6);
    }
  });

  it("does not make a diagonal faster than a cardinal", () => {
    const cardinal = runBarista(createBaristaState(800, 600), input(1, 0), 120);
    const diagonal = runBarista(createBaristaState(800, 600), input(1, 1), 120);
    expect(baristaSpeed(diagonal)).toBeCloseTo(baristaSpeed(cardinal), 6);
  });

  it("stops within the expected distance once the thumb lets go", () => {
    const state = runBarista(createBaristaState(800, 600), input(1, 0), 120);
    expect(baristaSpeed(state)).toBeCloseTo(BARISTA.maxSpeed, 6);

    const startX = state.x;
    // v^2 / 2a with the contract's friction: 220^2 / (2 * 1500) ~= 16 units.
    const expectedStop = (BARISTA.maxSpeed * BARISTA.maxSpeed) / (2 * BARISTA.friction);

    const idle = input(0, 0);
    let steps = 0;
    while (baristaSpeed(state) > 0 && steps < 600) {
      stepBarista(state, idle, STEP_SECONDS, openGeometry, state);
      steps += 1;
    }

    expect(baristaSpeed(state)).toBe(0);
    // Snappy: fully stopped inside a fifth of a second.
    expect(steps).toBeLessThan(0.2 * 60);
    expect(state.x - startX).toBeLessThan(expectedStop + BARISTA.maxSpeed * STEP_SECONDS);
    expect(state.x - startX).toBeGreaterThan(0);
  });

  it("keeps facing while strafing — aim is independent of movement", () => {
    const state = createBaristaState(800, 600, 0);
    state.aim = 1.25;

    // Drive a full circle of directions; the aim must never move.
    for (let i = 0; i < 32; i += 1) {
      const angle = (i / 32) * Math.PI * 2;
      runBarista(state, input(Math.cos(angle), Math.sin(angle)), 10);
      expect(state.aim).toBe(1.25);
    }

    // And the barista really did move, so this is not a vacuous assertion.
    expect(length(state.x - 800, state.y - 600)).toBeGreaterThan(1);
  });

  it("cannot pass through the wall from any approach angle", () => {
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      const state = createBaristaState(800, 600, 0);
      const command = input(Math.cos(angle), Math.sin(angle));

      for (let step = 0; step < 600; step += 1) {
        stepBarista(state, command, STEP_SECONDS, openGeometry, state);
        expect(state.x).toBeGreaterThanOrEqual(openGeometry.minX + BARISTA.radius - 1e-6);
        expect(state.x).toBeLessThanOrEqual(openGeometry.maxX - BARISTA.radius + 1e-6);
        expect(state.y).toBeGreaterThanOrEqual(openGeometry.minY + BARISTA.radius - 1e-6);
        expect(state.y).toBeLessThanOrEqual(openGeometry.maxY - BARISTA.radius + 1e-6);
      }
    }
  });

  it("cannot pass through a crate from any approach angle, even with knockback", () => {
    // The centre block: x 700..900, y 540..660.
    const centreX = 800;
    const centreY = 600;
    const startRadius = 260;

    for (let i = 0; i < 32; i += 1) {
      const angle = (i / 32) * Math.PI * 2;
      const state = createBaristaState(
        centreX + Math.cos(angle) * startRadius,
        centreY + Math.sin(angle) * startRadius,
      );
      // Walk straight at the block, and add a shove pointing the same way so
      // the body is travelling faster than the movement model alone allows.
      const command = input(-Math.cos(angle), -Math.sin(angle));
      applyKnockback(state, angle + Math.PI, BARISTA.knockbackSpeed * 3);

      for (let step = 0; step < 300; step += 1) {
        stepBarista(state, command, STEP_SECONDS, geometry, state);
        expect(isCircleClear(geometry, state.x, state.y, BARISTA.radius - 1e-6)).toBe(true);
      }
    }
  });

  it("slides along a crate instead of sticking to it", () => {
    // Approach the centre block's left face at a shallow angle.
    const state = createBaristaState(600, 500);
    const command = input(1, 0.35);
    runBarista(state, command, 240, geometry);

    expect(isCircleClear(geometry, state.x, state.y, BARISTA.radius - 1e-6)).toBe(true);
    // It kept travelling down the face rather than stalling at first contact.
    expect(state.y).toBeGreaterThan(560);
  });

  it("decays a knockback impulse back to zero", () => {
    const state = createBaristaState(800, 300);
    applyKnockback(state, Math.PI / 2);
    expect(length(state.knockbackX, state.knockbackY)).toBeCloseTo(BARISTA.knockbackSpeed, 6);

    runBarista(state, input(0, 0), 60);
    expect(length(state.knockbackX, state.knockbackY)).toBe(0);
    expect(state.y).toBeGreaterThan(300);
  });
});

// ---------------------------------------------------------------------------
// bean-pool
// ---------------------------------------------------------------------------

describe("bean pool", () => {
  it("preallocates its whole capacity and never grows", () => {
    const pool = createBeanPool(8);
    expect(pool.capacity).toBe(8);
    expect(pool.beans).toHaveLength(8);
    expect(pool.activeCount).toBe(0);
    for (let i = 0; i < pool.beans.length; i += 1) {
      expect(pool.beans[i]?.active).toBe(false);
    }
    expect(createBeanPool().capacity).toBe(DEFAULT_BEAN_CAPACITY);
  });

  // The whole point of the pool. If a single new object appears here, the hot
  // path is allocating and the mid-range Android drops frames (§13).
  it("allocates nothing after construction", () => {
    const pool = createBeanPool(16);
    const identities = pool.beans.slice();
    const backing = pool.beans;

    for (let round = 0; round < 40; round += 1) {
      for (let i = 0; i < 6; i += 1) {
        pool.acquire(7, 800, 600, (i / 6) * Math.PI * 2);
      }
      for (let step = 0; step < 20; step += 1) pool.step(STEP_SECONDS, geometry);
      pool.releaseAll();
    }

    expect(pool.beans).toBe(backing);
    expect(pool.beans).toHaveLength(identities.length);
    for (let i = 0; i < identities.length; i += 1) {
      expect(pool.beans[i]).toBe(identities[i]);
    }
  });

  it("recycles the oldest bean when exhausted", () => {
    const pool = createBeanPool(4);
    const first = pool.acquire(1, 700, 600, 0);
    pool.acquire(1, 700, 600, 0);
    pool.acquire(1, 700, 600, 0);
    const fourth = pool.acquire(1, 700, 600, 0);
    expect(pool.activeCount).toBe(4);

    const fifth = pool.acquire(2, 800, 600, Math.PI);
    // The pool never grows and never drops a throw: the oldest slot is reused.
    expect(pool.activeCount).toBe(4);
    expect(pool.capacity).toBe(4);
    expect(fifth).toBe(first);
    expect(fifth.ownerBadge).toBe(2);
    expect(fifth.ageMs).toBe(0);
    expect(fourth.active).toBe(true);
  });

  it("returns released slots to the free list", () => {
    const pool = createBeanPool(3);
    const bean = pool.acquire(1, 700, 600, 0);
    expect(pool.activeCount).toBe(1);
    pool.release(bean);
    expect(pool.activeCount).toBe(0);
    // Releasing twice is a no-op, not a double free.
    pool.release(bean);
    expect(pool.activeCount).toBe(0);

    const reused = pool.acquire(2, 700, 600, 0);
    expect(reused).toBe(bean);
    expect(pool.activeCount).toBe(1);
  });

  it("despawns a bean when its lifetime expires", () => {
    // Straight up the empty middle of the open arena so nothing else stops it.
    const pool = createBeanPool(4);
    pool.acquire(1, 800, 1_000, -Math.PI / 2);

    let elapsedMs = 0;
    while (pool.activeCount > 0 && elapsedMs < 5_000) {
      pool.step(STEP_SECONDS, openGeometry);
      elapsedMs += STEP_SECONDS * 1000;
    }

    expect(elapsedMs).toBeGreaterThanOrEqual(BEAN.lifetimeMs);
    expect(elapsedMs).toBeLessThan(BEAN.lifetimeMs + 40);
  });

  it("despawns a bean on the wall", () => {
    const pool = createBeanPool(4);
    pool.acquire(1, 800, 200, -Math.PI / 2);

    let elapsedMs = 0;
    while (pool.activeCount > 0 && elapsedMs < 5_000) {
      pool.step(STEP_SECONDS, openGeometry);
      elapsedMs += STEP_SECONDS * 1000;
    }

    // 200 - 40 = 160 units to the wall at 520 u/s is well inside the lifetime.
    expect(elapsedMs).toBeLessThan(BEAN.lifetimeMs);
    expect(elapsedMs).toBeGreaterThan(((200 - geometry.minY) / BEAN.speed) * 1000 - 20);
  });

  it("despawns a bean on cover — a fast bean cannot tunnel thin cover", () => {
    // The two offset pillars are 90 units wide; a bean covers 8.7 units per
    // 60 Hz step and 17.3 per 30 Hz server tick, so a point test would still
    // catch those. The segment sweep is what holds when the pillar is thinner
    // than a step, so test that directly with a deliberately thin crate.
    const thinArena: ArenaDefinition = {
      ...ROASTERY_FLOOR,
      id: "test-thin",
      obstacles: [{ x: 800, y: 400, width: 2, height: 400 }],
    };
    const thinGeometry = buildArenaGeometry(thinArena);

    // One step at a coarse tick jumps 52 units, far more than the crate is wide.
    const coarseStep = 1 / 10;
    expect(BEAN.speed * coarseStep).toBeGreaterThan(2);

    const pool = createBeanPool(4);
    const bean = pool.acquire(1, 600, 600, 0);

    let steps = 0;
    while (pool.activeCount > 0 && steps < 20) {
      pool.step(coarseStep, thinGeometry);
      steps += 1;
    }

    expect(pool.activeCount).toBe(0);
    // Stopped short of the crate rather than carried through it...
    expect(bean.x).toBeLessThan(800);
    // ...and the step that stopped it would have landed the far side of the
    // crate, which is exactly the case a point test misses.
    expect(bean.x + BEAN.speed * coarseStep).toBeGreaterThan(802);
  });

  it("matches the server's stepper for the same inputs", () => {
    // The server steps beans at COMBAT_TICK_HZ over authoritative state (§7a):
    // advance, expire on lifetime, then despawn on the wall or cover, tested as
    // a swept segment. This is that algorithm written out independently; if the
    // pool ever drifts from it, a shooter would see a bean connect that the
    // scoreboard never counted.
    interface ReferenceBean {
      x: number;
      y: number;
      vx: number;
      vy: number;
      ageMs: number;
      active: boolean;
    }

    const referenceStep = (bean: ReferenceBean, dtSeconds: number, target: ArenaGeometry): void => {
      if (!bean.active) return;
      const nextX = bean.x + bean.vx * dtSeconds;
      const nextY = bean.y + bean.vy * dtSeconds;
      bean.ageMs += dtSeconds * 1000;
      if (bean.ageMs >= BEAN.lifetimeMs) {
        bean.active = false;
        return;
      }
      if (segmentArenaHit(target, bean.x, bean.y, nextX, nextY) !== NO_HIT) {
        bean.active = false;
        return;
      }
      bean.x = nextX;
      bean.y = nextY;
    };

    const origins: ReadonlyArray<readonly [number, number, number]> = [
      [200, 200, 0.3],
      [800, 600, Math.PI],
      [1_400, 1_000, -2.1],
      [400, 900, 1.9],
      [1_000, 150, 2.6],
      [640, 700, -0.75],
    ];

    // Both cadences: the client's 60 Hz prediction and the server's 30 Hz tick.
    for (const dtSeconds of [1 / 60, 1 / 30]) {
      for (const origin of origins) {
        const [x, y, angle] = origin;
        const pool = createBeanPool(2);
        const bean = pool.acquire(1, x, y, angle);
        const reference: ReferenceBean = {
          x,
          y,
          vx: Math.cos(angle) * BEAN.speed,
          vy: Math.sin(angle) * BEAN.speed,
          ageMs: 0,
          active: true,
        };

        for (let tick = 0; tick < 120; tick += 1) {
          pool.step(dtSeconds, geometry);
          referenceStep(reference, dtSeconds, geometry);

          expect(bean.active).toBe(reference.active);
          if (!reference.active) break;
          expect(bean.x).toBeCloseTo(reference.x, 9);
          expect(bean.y).toBeCloseTo(reference.y, 9);
          expect(bean.ageMs).toBeCloseTo(reference.ageMs, 9);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------

describe("camera", () => {
  it("clamps to the arena bounds and never shows outside the wall", () => {
    const out = createVector();
    const viewWidth = 620;
    const viewHeight = 900;

    // Hard against each corner.
    clampCamera(geometry, -5_000, -5_000, viewWidth, viewHeight, out);
    expect(out.x).toBe(viewWidth / 2);
    expect(out.y).toBe(viewHeight / 2);

    clampCamera(geometry, 5_000, 5_000, viewWidth, viewHeight, out);
    expect(out.x).toBe(ROASTERY_FLOOR.width - viewWidth / 2);
    expect(out.y).toBe(ROASTERY_FLOOR.height - viewHeight / 2);

    // Sweep the whole arena plus a wide margin: the view must always stay in.
    for (let x = -400; x <= ROASTERY_FLOOR.width + 400; x += 37) {
      for (let y = -400; y <= ROASTERY_FLOOR.height + 400; y += 41) {
        clampCamera(geometry, x, y, viewWidth, viewHeight, out);
        expect(out.x - viewWidth / 2).toBeGreaterThanOrEqual(-1e-9);
        expect(out.x + viewWidth / 2).toBeLessThanOrEqual(ROASTERY_FLOOR.width + 1e-9);
        expect(out.y - viewHeight / 2).toBeGreaterThanOrEqual(-1e-9);
        expect(out.y + viewHeight / 2).toBeLessThanOrEqual(ROASTERY_FLOOR.height + 1e-9);
      }
    }
  });

  it("follows the player while the view fits inside the arena", () => {
    const out = createVector();
    clampCamera(geometry, 800, 600, 620, 900, out);
    expect(out.x).toBe(800);
    expect(out.y).toBe(600);
  });

  it("centres an axis whose view is wider than the arena", () => {
    const out = createVector();
    clampCamera(geometry, 100, 100, 4_000, 4_000, out);
    expect(out.x).toBe(ROASTERY_FLOOR.width / 2);
    expect(out.y).toBe(ROASTERY_FLOOR.height / 2);
  });

  it("keeps the default view smaller than the arena on both axes", () => {
    // Otherwise the clamp above would silently become a centre-on-the-arena.
    expect(VIEW_WIDTH).toBeLessThan(ROASTERY_FLOOR.width);
    expect(VIEW_HEIGHT).toBeLessThan(ROASTERY_FLOOR.height);
  });
});

// ---------------------------------------------------------------------------
// battle-engine: jsdom has no 2D context, the simulation must still work
// ---------------------------------------------------------------------------

const mountEngine = (reducedMotion = true) => {
  const canvas = document.createElement("canvas");
  const fires: Array<{ x: number; y: number; angle: number }> = [];
  const huds: Array<{ hearts: number; ammo: number }> = [];
  const poses: Array<{ x: number; y: number; aim: number }> = [];

  const engine = createBattleEngine({
    canvas,
    arena: ROASTERY_FLOOR,
    selfBadgeNumber: 7,
    selfColour: "#6f3219",
    spawnIndex: 0,
    reducedMotion,
    onFire: (payload) => {
      fires.push(payload);
    },
    onBroadcast: (pose) => {
      poses.push(pose);
    },
    onHud: (hud) => {
      huds.push({ hearts: hud.hearts, ammo: hud.ammo });
    },
  });

  return { engine, fires, huds, poses };
};

describe("battle engine", () => {
  it("constructs and tears down without a 2D context", () => {
    const { engine } = mountEngine();

    const spawn = createVector();
    spawnPoint(geometry, 0, spawn);
    const pose = engine.getPose();
    expect(pose.x).toBeCloseTo(spawn.x, 6);
    expect(pose.y).toBeCloseTo(spawn.y, 6);

    engine.setMove(1, 0);
    engine.setAim(0.5);
    engine.setFiring(true);
    engine.setFiring(false);
    engine.requestReload();

    const now = Date.now();
    engine.mount(now + 60_000, now + 60_000 + 120_000);

    engine.destroy();
    engine.destroy();
  });

  it("spawns the player on the requested spawn point, clear of cover", () => {
    for (let slot = 0; slot < ROASTERY_FLOOR.spawnPoints.length; slot += 1) {
      const canvas = document.createElement("canvas");
      const engine = createBattleEngine({
        canvas,
        arena: ROASTERY_FLOOR,
        selfBadgeNumber: slot + 1,
        selfColour: "#6f3219",
        spawnIndex: slot,
        reducedMotion: true,
        onFire: () => undefined,
        onBroadcast: () => undefined,
        onHud: () => undefined,
      });
      const pose = engine.getPose();
      expect(isCircleClear(geometry, pose.x, pose.y, BARISTA.radius)).toBe(true);
      engine.destroy();
    }
  });

  it("keeps the aim the caller set, whatever the movement input", () => {
    const { engine } = mountEngine();
    engine.setAim(-1.75);
    engine.setMove(1, 1);
    expect(engine.getPose().aim).toBe(-1.75);
    engine.setMove(-1, 0);
    expect(engine.getPose().aim).toBe(-1.75);
    engine.destroy();
  });

  it("accepts server verdicts for hearts, respawns, ammo and power-ups", () => {
    const { engine } = mountEngine();
    const now = Date.now();
    engine.mount(now, now + 120_000);

    engine.upsertGhost({
      badgeNumber: 12,
      colour: "#1f6f8b",
      x: 400,
      y: 400,
      aim: 0,
      hearts: 3,
      downed: false,
    });
    engine.upsertGhost({
      badgeNumber: 12,
      colour: "#1f6f8b",
      x: 420,
      y: 405,
      aim: 0.2,
      hearts: 2,
      downed: false,
    });

    // A splash we took: hearts come from the verdict, never from the engine.
    engine.applyHit({
      shooterBadge: 12,
      victimBadge: 7,
      x: 800,
      y: 600,
      victimHearts: 1,
      shielded: false,
      downed: false,
    });

    engine.applyRespawn({ badgeNumber: 7, x: 140, y: 1_060, hearts: 2 });
    const pose = engine.getPose();
    expect(pose.x).toBe(140);
    expect(pose.y).toBe(1_060);

    engine.applyAmmo(3, now + 1_000);
    engine.applyAmmo(WEAPON.clipSize, null);
    engine.applyShot({ badgeNumber: 12, x: 400, y: 400, angles: [0, 0.14, -0.14] });
    engine.applyShot({ badgeNumber: 7, x: 140, y: 1_060, angles: [0] });
    engine.applyPad(0, "RAPID");
    engine.applyPad(99, "SHIELD");
    engine.applyPower("TRIPLE", now + 6_000);
    engine.applyPower("REFILL", null);
    engine.applyPower(null, null);

    engine.removeGhost(12);
    engine.removeGhost(404);

    engine.destroy();
  });

  it("survives more ghosts than the room can hold", () => {
    const { engine } = mountEngine();
    for (let i = 0; i < MAX_PLAYERS + 4; i += 1) {
      engine.upsertGhost({
        badgeNumber: i + 1,
        colour: "#28734f",
        x: 200 + i * 10,
        y: 200,
        aim: 0,
        hearts: 3,
        downed: false,
      });
    }
    engine.destroy();
  });
});
