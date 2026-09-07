import { describe, expect, it } from "vitest";

import {
  BARISTA,
  BEAN,
  HEALTH,
  POWER_UP,
  ROASTERY_FLOOR,
  SPEED_TOLERANCE,
  WEAPON,
} from "../src/modules/arena/arena-contract.js";
import type { Bean } from "../src/modules/arena/arena-types.js";
import {
  clampPosition,
  furthestSpawnPoint,
  isTargetable,
  minFireIntervalMs,
  pushOutOfObstacles,
  resolveHit,
  segmentIntersectsCircle,
  segmentIntersectsRect,
  spawnBeans,
  stepBeans,
  validateFire,
  type CombatTarget,
  type FireShooterState,
} from "../src/modules/arena/combat.js";

const NOW = 1_700_000_000_000;

/**
 * y = 1120 runs clear of every obstacle in the Roastery Floor, so it is the
 * lane these tests fight down whenever the line of sight has to be open.
 */
const CLEAR_LANE_Y = 1120;
/** A row that passes straight through the lower-left crate (300..460, 890..980). */
const CRATE_LANE_Y = 930;

const target = (overrides: Partial<CombatTarget> = {}): CombatTarget => ({
  playerId: "victim",
  badgeNumber: 2,
  x: 600,
  y: CLEAR_LANE_Y,
  hearts: 3,
  downedUntilMs: 0,
  invulnerableUntilMs: 0,
  ...overrides,
});

const shooter = (overrides: Partial<FireShooterState> = {}): FireShooterState => ({
  x: 400,
  y: CLEAR_LANE_Y,
  hearts: 3,
  downedUntilMs: 0,
  ammo: WEAPON.clipSize,
  reloadingUntilMs: 0,
  lastFireAtMs: NOW - 1_000,
  powerUp: null,
  powerUpUntilMs: 0,
  ...overrides,
});

const beanAt = (x: number, y: number, angle: number, overrides: Partial<Bean> = {}): Bean => ({
  id: 1,
  ownerPlayerId: "shooter",
  ownerBadgeNumber: 1,
  x,
  y,
  vx: Math.cos(angle) * BEAN.speed,
  vy: Math.sin(angle) * BEAN.speed,
  expiresAtMs: NOW + BEAN.lifetimeMs,
  ...overrides,
});

const step = (
  beans: readonly Bean[],
  targets: readonly CombatTarget[],
  dtMs: number,
  nowMs = NOW,
): ReturnType<typeof stepBeans> =>
  stepBeans({ beans, targets, arena: ROASTERY_FLOOR, nowMs, dtMs });

describe("arena geometry", () => {
  it("reports where a segment first meets a box and when it misses", () => {
    const crate = { x: 300, y: 890, width: 160, height: 90 };

    expect(segmentIntersectsRect(200, CRATE_LANE_Y, 600, CRATE_LANE_Y, crate)).toBeCloseTo(0.25, 5);
    expect(segmentIntersectsRect(200, 100, 600, 100, crate)).toBeNull();
    // A segment starting inside is already touching it.
    expect(segmentIntersectsRect(380, 930, 600, 930, crate)).toBe(0);
  });

  it("reports where a segment first meets a circle and when it misses", () => {
    expect(segmentIntersectsCircle(0, 0, 100, 0, 50, 0, 10)).toBeCloseTo(0.4, 5);
    expect(segmentIntersectsCircle(0, 0, 100, 0, 50, 40, 10)).toBeNull();
    expect(segmentIntersectsCircle(50, 0, 100, 0, 50, 0, 10)).toBe(0);
    // The circle sits behind the segment's start, so it is never reached.
    expect(segmentIntersectsCircle(60, 0, 100, 0, 20, 0, 10)).toBeNull();
  });

  it("pushes a point out of cover along the shallowest axis", () => {
    const pushed = pushOutOfObstacles(ROASTERY_FLOOR, { x: 780, y: 550 }, BARISTA.radius);

    // The centre block is 700..900 x 540..660; leaving by the top edge is the
    // shortest way out from just inside it.
    expect(pushed.y).toBe(540 - BARISTA.radius);
    expect(pushed.x).toBe(780);
  });
});

describe("bean stepping", () => {
  it("splashes a rival down a clear line", () => {
    const result = step([beanAt(400, CLEAR_LANE_Y, 0)], [target()], 400);

    expect(result.hits).toHaveLength(1);
    expect(result.beans).toHaveLength(0);
    expect(result.hits[0]).toMatchObject({
      shooterBadgeNumber: 1,
      victimBadgeNumber: 2,
      beanId: 1,
    });
    expect(result.hits[0]?.x).toBeCloseTo(600 - (BARISTA.radius + BEAN.radius), 5);
  });

  it("reaches the same verdict whichever order the players arrive in", () => {
    const near = target({ playerId: "near", badgeNumber: 2, x: 600 });
    const far = target({ playerId: "far", badgeNumber: 3, x: 700 });
    const bean = beanAt(400, CLEAR_LANE_Y, 0);

    const forward = step([bean], [near, far], 1_000);
    const reversed = step([bean], [far, near], 1_000);

    expect(forward.hits).toEqual(reversed.hits);
    expect(forward.hits[0]?.victimPlayerId).toBe("near");
  });

  it("is stopped by a crate between the shooter and the target", () => {
    const blocked = step(
      [beanAt(200, CRATE_LANE_Y, 0)],
      [target({ x: 600, y: CRATE_LANE_Y })],
      1_000,
    );

    expect(blocked.hits).toHaveLength(0);
    expect(blocked.beans).toHaveLength(0);
  });

  it("still splashes a target standing in front of cover", () => {
    // The target sits at x=260, the crate starts at x=300: the nearest thing
    // along the segment wins, so the barista is hit and the crate is irrelevant.
    const result = step(
      [beanAt(200, CRATE_LANE_Y, 0)],
      [target({ x: 260, y: CRATE_LANE_Y })],
      1_000,
    );

    expect(result.hits).toHaveLength(1);
  });

  it("is swallowed by the arena wall", () => {
    const result = step([beanAt(1500, CLEAR_LANE_Y, 0)], [], 200);

    expect(result.beans).toHaveLength(0);
    expect(result.hits).toHaveLength(0);
  });

  it("cannot tunnel a target between two ticks", () => {
    const dtMs = 2_000;
    const bean = beanAt(300, CLEAR_LANE_Y, 0);
    const victim = target({ x: 900 });

    // Point sampling would land the bean at x=1340, well past the barista.
    expect(bean.x + bean.vx * (dtMs / 1000)).toBeGreaterThan(victim.x + BARISTA.radius);

    const result = step([bean], [victim], dtMs);

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.victimBadgeNumber).toBe(2);
  });

  it("never lets a shooter splash themselves", () => {
    const result = step(
      [beanAt(400, CLEAR_LANE_Y, 0)],
      [target({ playerId: "shooter", badgeNumber: 1, x: 420 })],
      400,
    );

    expect(result.hits).toHaveLength(0);
  });

  it("skips invulnerable and downed rivals but not disconnected ones", () => {
    const invulnerable = step(
      [beanAt(400, CLEAR_LANE_Y, 0)],
      [target({ invulnerableUntilMs: NOW + 500 })],
      400,
    );
    const downed = step(
      [beanAt(400, CLEAR_LANE_Y, 0)],
      [target({ hearts: 0, downedUntilMs: NOW + 3_000 })],
      400,
    );
    // `CombatTarget` deliberately carries no connection flag: a barista whose
    // phone dropped is still standing there and stays a valid target (§5).
    const standing = step([beanAt(400, CLEAR_LANE_Y, 0)], [target()], 400);

    expect(invulnerable.hits).toHaveLength(0);
    expect(downed.hits).toHaveLength(0);
    expect(standing.hits).toHaveLength(1);
  });

  it("despawns a bean once its flight time is up", () => {
    const stale = beanAt(400, CLEAR_LANE_Y, 0, { expiresAtMs: NOW - 1 });
    const result = step([stale], [target()], 400);

    expect(result.beans).toHaveLength(0);
    expect(result.hits).toHaveLength(0);
  });

  it("advances a bean that reaches nothing", () => {
    const result = step([beanAt(400, CLEAR_LANE_Y, 0)], [], 100);

    expect(result.beans).toHaveLength(1);
    expect(result.beans[0]?.x).toBeCloseTo(400 + BEAN.speed * 0.1, 5);
  });
});

describe("firing", () => {
  it("accepts an honest throw and reports whether it is a triple", () => {
    expect(
      validateFire({
        inBattle: true,
        shooter: shooter(),
        request: { x: 400, y: CLEAR_LANE_Y, angle: 0 },
        nowMs: NOW,
      }),
    ).toEqual({ ok: true, triple: false });

    expect(
      validateFire({
        inBattle: true,
        shooter: shooter({ powerUp: "TRIPLE", powerUpUntilMs: NOW + 1_000 }),
        request: { x: 400, y: CLEAR_LANE_Y, angle: 0 },
        nowMs: NOW,
      }),
    ).toEqual({ ok: true, triple: true });
  });

  it("refuses a throw outside a running round or from a downed barista", () => {
    expect(
      validateFire({
        inBattle: false,
        shooter: shooter(),
        request: { x: 400, y: CLEAR_LANE_Y, angle: 0 },
        nowMs: NOW,
      }),
    ).toEqual({ ok: false, reason: "NOT_IN_BATTLE" });

    expect(
      validateFire({
        inBattle: true,
        shooter: shooter({ hearts: 0, downedUntilMs: NOW + 2_000 }),
        request: { x: 400, y: CLEAR_LANE_Y, angle: 0 },
        nowMs: NOW,
      }),
    ).toEqual({ ok: false, reason: "DOWNED" });
  });

  it("refuses a cadence below the server floor, but tolerates honest jitter", () => {
    const tooFast = validateFire({
      inBattle: true,
      shooter: shooter({ lastFireAtMs: NOW - (WEAPON.minFireIntervalMs - 1) }),
      request: { x: 400, y: CLEAR_LANE_Y, angle: 0 },
      nowMs: NOW,
    });
    // The client's own interval sits above the floor, so a phone firing at its
    // normal cadence is never rejected.
    const jittery = validateFire({
      inBattle: true,
      shooter: shooter({ lastFireAtMs: NOW - WEAPON.fireIntervalMs }),
      request: { x: 400, y: CLEAR_LANE_Y, angle: 0 },
      nowMs: NOW,
    });

    expect(tooFast).toEqual({ ok: false, reason: "TOO_SOON" });
    expect(jittery).toEqual({ ok: true, triple: false });
    expect(WEAPON.minFireIntervalMs).toBeLessThan(WEAPON.fireIntervalMs);
  });

  it("lowers the cadence floor while rapid roast is active", () => {
    const rapid = shooter({ powerUp: "RAPID", powerUpUntilMs: NOW + 1_000 });

    expect(minFireIntervalMs(rapid, NOW)).toBeCloseTo(
      WEAPON.minFireIntervalMs * POWER_UP.rapid.fireIntervalFactor,
      5,
    );
    expect(
      validateFire({
        inBattle: true,
        shooter: shooter({
          powerUp: "RAPID",
          powerUpUntilMs: NOW + 1_000,
          lastFireAtMs: NOW - 100,
        }),
        request: { x: 400, y: CLEAR_LANE_Y, angle: 0 },
        nowMs: NOW,
      }),
    ).toEqual({ ok: true, triple: false });
  });

  it("refuses a throw with no ammo or mid-reload", () => {
    expect(
      validateFire({
        inBattle: true,
        shooter: shooter({ ammo: 0 }),
        request: { x: 400, y: CLEAR_LANE_Y, angle: 0 },
        nowMs: NOW,
      }),
    ).toEqual({ ok: false, reason: "NO_AMMO" });

    expect(
      validateFire({
        inBattle: true,
        shooter: shooter({ reloadingUntilMs: NOW + 500 }),
        request: { x: 400, y: CLEAR_LANE_Y, angle: 0 },
        nowMs: NOW,
      }),
    ).toEqual({ ok: false, reason: "RELOADING" });
  });

  it("refuses an origin that has drifted away from the server's position", () => {
    expect(
      validateFire({
        inBattle: true,
        shooter: shooter(),
        request: { x: 400 + WEAPON.maxOriginDrift + 1, y: CLEAR_LANE_Y, angle: 0 },
        nowMs: NOW,
      }),
    ).toEqual({ ok: false, reason: "ORIGIN_DRIFT" });

    expect(
      validateFire({
        inBattle: true,
        shooter: shooter(),
        request: { x: 400 + WEAPON.maxOriginDrift - 1, y: CLEAR_LANE_Y, angle: 0 },
        nowMs: NOW,
      }),
    ).toEqual({ ok: true, triple: false });

    expect(
      validateFire({
        inBattle: true,
        shooter: shooter(),
        request: { x: Number.NaN, y: CLEAR_LANE_Y, angle: 0 },
        nowMs: NOW,
      }),
    ).toEqual({ ok: false, reason: "INVALID_ORIGIN" });
  });

  it("spawns one bean, or three spread beans under triple shot", () => {
    const single = spawnBeans({
      ownerPlayerId: "shooter",
      ownerBadgeNumber: 1,
      x: 400,
      y: CLEAR_LANE_Y,
      angle: 0,
      triple: false,
      nowMs: NOW,
      firstBeanId: 9,
    });
    const volley = spawnBeans({
      ownerPlayerId: "shooter",
      ownerBadgeNumber: 1,
      x: 400,
      y: CLEAR_LANE_Y,
      angle: 0,
      triple: true,
      nowMs: NOW,
      firstBeanId: 10,
    });

    expect(single).toHaveLength(1);
    expect(single[0]).toMatchObject({ id: 9, expiresAtMs: NOW + BEAN.lifetimeMs });
    expect(single[0]?.vx).toBeCloseTo(BEAN.speed, 5);

    expect(volley).toHaveLength(3);
    expect(volley.map((bean) => bean.id)).toEqual([10, 11, 12]);
    expect(volley.map((bean) => Math.atan2(bean.vy, bean.vx))).toEqual([
      -POWER_UP.triple.spreadRad,
      0,
      POWER_UP.triple.spreadRad,
    ]);
  });
});

describe("hit resolution", () => {
  it("takes a heart, grants immunity and applies knockback", () => {
    const outcome = resolveHit({
      victim: { hearts: 3, shieldHits: 0, invulnerableUntilMs: 0, downedUntilMs: 0 },
      angle: 0,
      nowMs: NOW,
    });

    expect(outcome).toMatchObject({
      hearts: 2,
      shielded: false,
      downed: false,
      invulnerableUntilMs: NOW + HEALTH.invulnerableMs,
    });
    expect(outcome.knockbackVx).toBeCloseTo(BARISTA.knockbackSpeed, 5);
    expect(outcome.knockbackVy).toBeCloseTo(0, 5);
  });

  it("spends a shield charge before a heart", () => {
    const first = resolveHit({
      victim: { hearts: 3, shieldHits: 2, invulnerableUntilMs: 0, downedUntilMs: 0 },
      angle: 0,
      nowMs: NOW,
    });

    expect(first).toMatchObject({ hearts: 3, shieldHits: 1, shielded: true });

    const second = resolveHit({
      victim: { hearts: 3, shieldHits: 1, invulnerableUntilMs: 0, downedUntilMs: 0 },
      angle: 0,
      nowMs: NOW,
    });

    expect(second).toMatchObject({ hearts: 3, shieldHits: 0, shielded: true });

    const spent = resolveHit({
      victim: { hearts: 3, shieldHits: 0, invulnerableUntilMs: 0, downedUntilMs: 0 },
      angle: 0,
      nowMs: NOW,
    });

    expect(spent).toMatchObject({ hearts: 2, shielded: false });
  });

  it("sends a victim out of hearts for a refill break", () => {
    const outcome = resolveHit({
      victim: { hearts: 1, shieldHits: 0, invulnerableUntilMs: 0, downedUntilMs: 0 },
      angle: Math.PI,
      nowMs: NOW,
    });

    expect(outcome).toMatchObject({
      hearts: 0,
      downed: true,
      downedUntilMs: NOW + HEALTH.downedMs,
    });
  });

  it("cannot lose more than one heart to a single triple volley", () => {
    const volley = spawnBeans({
      ownerPlayerId: "shooter",
      ownerBadgeNumber: 1,
      x: 400,
      y: CLEAR_LANE_Y,
      angle: 0,
      triple: true,
      nowMs: NOW,
      firstBeanId: 1,
    });
    // Close range, so the spread has not yet pulled the outer two beans wide.
    const result = step(volley, [target({ x: 480 })], 400);

    expect(result.hits).toHaveLength(3);

    // All three land in the same tick, but the immunity granted by the first
    // verdict makes the rest of the volley bounce off.
    let victim = { hearts: 3, shieldHits: 0, invulnerableUntilMs: 0, downedUntilMs: 0 };

    for (const hit of result.hits) {
      const stillTargetable = isTargetable(
        target({ hearts: victim.hearts, invulnerableUntilMs: victim.invulnerableUntilMs }),
        NOW,
      );

      if (!stillTargetable) {
        continue;
      }

      victim = resolveHit({ victim, angle: hit.angle, nowMs: NOW });
    }

    expect(victim.hearts).toBe(2);
  });

  it("respawns furthest from the live rivals, deterministically", () => {
    const { spawnPoints } = ROASTERY_FLOOR;

    expect(furthestSpawnPoint(spawnPoints, [{ x: 140, y: 140 }])).toEqual({ x: 1460, y: 1060 });
    // No rivals at all leaves the choice to the first spawn point rather than
    // to chance, so a respawn is reproducible in a test.
    expect(furthestSpawnPoint(spawnPoints, [])).toEqual(spawnPoints[0]);
  });
});

describe("position clamping", () => {
  it("accepts movement that fits inside the speed budget", () => {
    const clamped = clampPosition({
      arena: ROASTERY_FLOOR,
      previous: { x: 400, y: CLEAR_LANE_Y },
      elapsedMs: 1_000,
      x: 500,
      y: CLEAR_LANE_Y,
    });

    expect(clamped).toEqual({ x: 500, y: CLEAR_LANE_Y, suspect: false });
  });

  it("clamps a teleport toward the reported point and flags the player", () => {
    const elapsedMs = 100;
    const clamped = clampPosition({
      arena: ROASTERY_FLOOR,
      previous: { x: 400, y: CLEAR_LANE_Y },
      elapsedMs,
      x: 1_400,
      y: CLEAR_LANE_Y,
    });
    const budget = (BARISTA.maxSpeed * SPEED_TOLERANCE * elapsedMs) / 1000 + BARISTA.radius;

    expect(clamped.suspect).toBe(true);
    expect(clamped.y).toBe(CLEAR_LANE_Y);
    // It moves toward the claim, never to it.
    expect(clamped.x).toBeCloseTo(400 + budget, 5);
    expect(clamped.x).toBeLessThan(1_400);
  });

  it("holds a barista inside the walls and out of cover", () => {
    const outside = clampPosition({
      arena: ROASTERY_FLOOR,
      previous: { x: 80, y: 80 },
      elapsedMs: 10_000,
      x: -500,
      y: -500,
    });
    const inCrate = clampPosition({
      arena: ROASTERY_FLOOR,
      previous: { x: 760, y: 600 },
      elapsedMs: 10_000,
      x: 800,
      y: 600,
    });

    expect(outside).toMatchObject({
      x: ROASTERY_FLOOR.wallInset + BARISTA.radius,
      y: ROASTERY_FLOOR.wallInset + BARISTA.radius,
    });
    // 700..900 x 540..660 is the centre block; the point cannot stay inside it.
    expect(inCrate.x <= 700 - BARISTA.radius || inCrate.y <= 540 - BARISTA.radius).toBe(true);
  });

  it("falls back to the last good point when the packet is not a number", () => {
    const clamped = clampPosition({
      arena: ROASTERY_FLOOR,
      previous: { x: 400, y: CLEAR_LANE_Y },
      elapsedMs: 100,
      x: Number.NaN,
      y: CLEAR_LANE_Y,
    });

    expect(clamped).toEqual({ x: 400, y: CLEAR_LANE_Y, suspect: true });
  });
});
