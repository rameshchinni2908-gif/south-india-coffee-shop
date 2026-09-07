/**
 * Hit resolution, bean stepping and fire validation.
 *
 * Every function here is pure: no timers, no sockets, no database, no clock of
 * its own — the caller passes `nowMs` in. That is deliberate. A shooter whose
 * score is client-reported has no score at all (BEAN-BLASTERS.md §7a), so the
 * whole scoreboard is decided here, and this file has to be exhaustively
 * testable in isolation. `arena-service.ts` owns only the timers around it.
 *
 * Beans are swept as **segments**, never sampled as points, so a fast bean
 * cannot tunnel through a thin barista or a thin crate between two ticks.
 */

import {
  BARISTA,
  BEAN,
  HEALTH,
  POWER_UP,
  SPEED_TOLERANCE,
  WEAPON,
  type ArenaDefinition,
  type ArenaObstacle,
  type ArenaPoint,
  type PowerUpKind,
} from "./arena-contract.js";
import type { Bean } from "./arena-types.js";

/** Below this, a floating-point delta is treated as no movement at all. */
const EPSILON = 1e-9;

/**
 * Slack added to the per-packet movement budget, in world units. It absorbs the
 * rounding of a phone that renders at 60 fps and reports at 15 Hz without
 * letting anyone travel meaningfully further than `maxSpeed` allows.
 */
const POSITION_SLACK = BARISTA.radius;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * First intersection of the segment `(x1,y1) → (x2,y2)` with an axis-aligned
 * box grown by `padding`, as a parametric distance in `[0, 1]`, or null when
 * the segment misses it. A segment that starts inside returns 0.
 */
export const segmentIntersectsRect = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: ArenaObstacle,
  padding = 0,
): number | null => {
  const slabs: readonly (readonly [number, number, number, number])[] = [
    [x1, x2 - x1, rect.x - padding, rect.x + rect.width + padding],
    [y1, y2 - y1, rect.y - padding, rect.y + rect.height + padding],
  ];

  let enter = 0;
  let exit = 1;

  for (const [origin, delta, low, high] of slabs) {
    if (Math.abs(delta) < EPSILON) {
      // Parallel to this slab: it can only ever be inside it or miss entirely.
      if (origin < low || origin > high) {
        return null;
      }

      continue;
    }

    const first = (low - origin) / delta;
    const second = (high - origin) / delta;

    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
  }

  return enter <= exit ? enter : null;
};

/**
 * First intersection of the segment with a circle, as a parametric distance in
 * `[0, 1]`, or null when it misses. A segment starting inside returns 0.
 */
export const segmentIntersectsCircle = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  centreX: number,
  centreY: number,
  radius: number,
): number | null => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const offsetX = x1 - centreX;
  const offsetY = y1 - centreY;
  const outside = offsetX * offsetX + offsetY * offsetY - radius * radius;

  if (outside <= 0) {
    return 0;
  }

  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared < EPSILON) {
    return null;
  }

  const projection = 2 * (offsetX * dx + offsetY * dy);
  const discriminant = projection * projection - 4 * lengthSquared * outside;

  if (discriminant < 0) {
    return null;
  }

  const entry = (-projection - Math.sqrt(discriminant)) / (2 * lengthSquared);

  return entry >= 0 && entry <= 1 ? entry : null;
};

/** The rectangle a body of `radius` may occupy, inside the arena's wall band. */
export const playableBounds = (
  arena: ArenaDefinition,
  radius: number,
): { minX: number; minY: number; maxX: number; maxY: number } => ({
  minX: arena.wallInset + radius,
  minY: arena.wallInset + radius,
  maxX: arena.width - arena.wallInset - radius,
  maxY: arena.height - arena.wallInset - radius,
});

const axisExitDistance = (origin: number, delta: number, low: number, high: number): number => {
  if (Math.abs(delta) < EPSILON) {
    return origin < low || origin > high ? 0 : Number.POSITIVE_INFINITY;
  }

  return delta > 0 ? (high - origin) / delta : (low - origin) / delta;
};

/**
 * Parametric distance at which the segment first leaves the playable rectangle
 * — the moment a bean buries itself in the wall — or null if it stays inside.
 */
export const segmentExitsBounds = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  arena: ArenaDefinition,
  radius: number,
): number | null => {
  const bounds = playableBounds(arena, radius);
  const exit = Math.min(
    axisExitDistance(x1, x2 - x1, bounds.minX, bounds.maxX),
    axisExitDistance(y1, y2 - y1, bounds.minY, bounds.maxY),
  );

  if (!Number.isFinite(exit) || exit > 1) {
    return null;
  }

  return Math.max(0, exit);
};

/**
 * Pushes a point out of any cover it has ended up inside, along the shallowest
 * axis, so a phone reporting a position inside a crate is corrected rather than
 * trusted. Two passes settle the corner case where escaping one crate lands the
 * barista inside its neighbour.
 */
export const pushOutOfObstacles = (
  arena: ArenaDefinition,
  point: ArenaPoint,
  radius: number,
): ArenaPoint => {
  let { x, y } = point;

  for (let pass = 0; pass < 2; pass += 1) {
    let moved = false;

    for (const obstacle of arena.obstacles) {
      const minX = obstacle.x - radius;
      const minY = obstacle.y - radius;
      const maxX = obstacle.x + obstacle.width + radius;
      const maxY = obstacle.y + obstacle.height + radius;

      if (x <= minX || x >= maxX || y <= minY || y >= maxY) {
        continue;
      }

      const left = x - minX;
      const right = maxX - x;
      const up = y - minY;
      const down = maxY - y;
      const shallowest = Math.min(left, right, up, down);

      if (shallowest === left) {
        x = minX;
      } else if (shallowest === right) {
        x = maxX;
      } else if (shallowest === up) {
        y = minY;
      } else {
        y = maxY;
      }

      moved = true;
    }

    if (!moved) {
      break;
    }
  }

  return { x, y };
};

// ---------------------------------------------------------------------------
// Movement (untrusted, therefore clamped)
// ---------------------------------------------------------------------------

export interface ClampPositionInput {
  readonly arena: ArenaDefinition;
  /** The last accepted point, or null for the first packet of a round. */
  readonly previous: ArenaPoint | null;
  /** Milliseconds since that packet. */
  readonly elapsedMs: number;
  readonly x: number;
  readonly y: number;
}

export interface ClampedPosition {
  readonly x: number;
  readonly y: number;
  /** The packet implied an impossible speed and was pulled back. */
  readonly suspect: boolean;
}

/**
 * Accepts a reported position, but never more of it than physics allows.
 *
 * A packet implying a speed above `maxSpeed * SPEED_TOLERANCE` is clamped
 * *toward* the reported point and flags the player `suspect` — it is never
 * rejected, because a casual game only needs one phone to be unable to hand
 * itself the win, and an honest phone recovering from a stall looks identical.
 * Whatever survives the speed clamp is then held inside the walls and pushed
 * back out of any cover.
 */
export const clampPosition = ({
  arena,
  previous,
  elapsedMs,
  x,
  y,
}: ClampPositionInput): ClampedPosition => {
  const fallback = previous ?? { x: arena.width / 2, y: arena.height / 2 };

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: fallback.x, y: fallback.y, suspect: true };
  }

  let suspect = false;
  let nextX = x;
  let nextY = y;

  if (previous) {
    const budget =
      (BARISTA.maxSpeed * SPEED_TOLERANCE * Math.max(0, elapsedMs)) / 1000 + POSITION_SLACK;
    const dx = x - previous.x;
    const dy = y - previous.y;
    const distance = Math.hypot(dx, dy);

    if (distance > budget) {
      const scale = budget / distance;

      nextX = previous.x + dx * scale;
      nextY = previous.y + dy * scale;
      suspect = true;
    }
  }

  const bounds = playableBounds(arena, BARISTA.radius);
  const inside = pushOutOfObstacles(
    arena,
    {
      x: Math.min(bounds.maxX, Math.max(bounds.minX, nextX)),
      y: Math.min(bounds.maxY, Math.max(bounds.minY, nextY)),
    },
    BARISTA.radius,
  );

  return { x: inside.x, y: inside.y, suspect };
};

// ---------------------------------------------------------------------------
// Firing
// ---------------------------------------------------------------------------

export interface FireShooterState {
  readonly x: number;
  readonly y: number;
  readonly hearts: number;
  readonly downedUntilMs: number;
  readonly ammo: number;
  readonly reloadingUntilMs: number;
  readonly lastFireAtMs: number;
  readonly powerUp: PowerUpKind | null;
  readonly powerUpUntilMs: number;
}

export interface FireRequest {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export type FireRejectionReason =
  | "NOT_IN_BATTLE"
  | "DOWNED"
  | "TOO_SOON"
  | "RELOADING"
  | "NO_AMMO"
  | "ORIGIN_DRIFT"
  | "INVALID_ORIGIN";

export type FireValidation =
  | { readonly ok: true; readonly triple: boolean }
  | { readonly ok: false; readonly reason: FireRejectionReason };

export interface ValidateFireInput {
  readonly inBattle: boolean;
  readonly shooter: FireShooterState;
  readonly request: FireRequest;
  readonly nowMs: number;
}

export const hasPowerUp = (
  shooter: Pick<FireShooterState, "powerUp" | "powerUpUntilMs">,
  kind: PowerUpKind,
  nowMs: number,
): boolean => shooter.powerUp === kind && shooter.powerUpUntilMs > nowMs;

/**
 * The cadence floor the server enforces. Deliberately below the client's own
 * interval so honest jitter is never rejected, and scaled by the rapid-fire
 * power-up so taking a pad does not make your own shots look like a hack.
 */
export const minFireIntervalMs = (
  shooter: Pick<FireShooterState, "powerUp" | "powerUpUntilMs">,
  nowMs: number,
): number =>
  hasPowerUp(shooter, "RAPID", nowMs)
    ? WEAPON.minFireIntervalMs * POWER_UP.rapid.fireIntervalFactor
    : WEAPON.minFireIntervalMs;

/**
 * Checks a throw request in the order set out in BEAN-BLASTERS.md §7a. A
 * rejection is reported to the caller so it can drop the shot *silently* — a
 * laggy honest phone must never be spammed with warnings.
 */
export const validateFire = ({
  inBattle,
  shooter,
  request,
  nowMs,
}: ValidateFireInput): FireValidation => {
  if (!inBattle) {
    return { ok: false, reason: "NOT_IN_BATTLE" };
  }

  if (shooter.downedUntilMs > nowMs || shooter.hearts <= 0) {
    return { ok: false, reason: "DOWNED" };
  }

  if (nowMs - shooter.lastFireAtMs < minFireIntervalMs(shooter, nowMs)) {
    return { ok: false, reason: "TOO_SOON" };
  }

  if (shooter.reloadingUntilMs > nowMs) {
    return { ok: false, reason: "RELOADING" };
  }

  if (shooter.ammo <= 0) {
    return { ok: false, reason: "NO_AMMO" };
  }

  if (
    !Number.isFinite(request.x) ||
    !Number.isFinite(request.y) ||
    !Number.isFinite(request.angle)
  ) {
    return { ok: false, reason: "INVALID_ORIGIN" };
  }

  if (Math.hypot(request.x - shooter.x, request.y - shooter.y) > WEAPON.maxOriginDrift) {
    return { ok: false, reason: "ORIGIN_DRIFT" };
  }

  return { ok: true, triple: hasPowerUp(shooter, "TRIPLE", nowMs) };
};

export interface SpawnBeansInput {
  readonly ownerPlayerId: string;
  readonly ownerBadgeNumber: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly triple: boolean;
  readonly nowMs: number;
  readonly firstBeanId: number;
}

/** One bean, or three spread by `POWER_UP.triple.spreadRad` under TRIPLE. */
export const spawnBeans = ({
  ownerPlayerId,
  ownerBadgeNumber,
  x,
  y,
  angle,
  triple,
  nowMs,
  firstBeanId,
}: SpawnBeansInput): Bean[] => {
  const offsets = triple
    ? [-POWER_UP.triple.spreadRad, 0, POWER_UP.triple.spreadRad]
    : ([0] as const);

  return offsets.map((offset, index) => {
    const beanAngle = angle + offset;

    return {
      id: firstBeanId + index,
      ownerPlayerId,
      ownerBadgeNumber,
      x,
      y,
      vx: Math.cos(beanAngle) * BEAN.speed,
      vy: Math.sin(beanAngle) * BEAN.speed,
      expiresAtMs: nowMs + BEAN.lifetimeMs,
    };
  });
};

// ---------------------------------------------------------------------------
// Stepping
// ---------------------------------------------------------------------------

/**
 * The subset of a barista a bean can collide with.
 *
 * There is deliberately no `isConnected` here: a player who has dropped off the
 * network is still standing on the roastery floor and stays a valid target
 * (§5). That is a small penalty for leaving, and it keeps hit resolution to a
 * single rule.
 */
export interface CombatTarget {
  readonly playerId: string;
  readonly badgeNumber: number;
  readonly x: number;
  readonly y: number;
  readonly hearts: number;
  readonly downedUntilMs: number;
  readonly invulnerableUntilMs: number;
}

export const isTargetable = (target: CombatTarget, nowMs: number): boolean =>
  target.hearts > 0 && target.downedUntilMs <= nowMs && target.invulnerableUntilMs <= nowMs;

export interface BeanHit {
  readonly beanId: number;
  readonly shooterPlayerId: string;
  readonly shooterBadgeNumber: number;
  readonly victimPlayerId: string;
  readonly victimBadgeNumber: number;
  /** Impact point, for the splash decal. */
  readonly x: number;
  readonly y: number;
  /** The bean's direction of travel, used for knockback. */
  readonly angle: number;
}

export interface StepBeansInput {
  readonly beans: readonly Bean[];
  readonly targets: readonly CombatTarget[];
  readonly arena: ArenaDefinition;
  readonly nowMs: number;
  readonly dtMs: number;
}

export interface StepBeansResult {
  /** Beans still in flight, advanced by `dtMs`. */
  readonly beans: Bean[];
  readonly hits: BeanHit[];
}

/**
 * Advances every bean by one tick and resolves what it ran into.
 *
 * Each bean's travel this tick is treated as a segment and the *nearest* thing
 * along it wins: cover and the wall block, and a rival is only splashed when it
 * sits in front of whatever would have stopped the bean. Comparing distances
 * rather than testing cover first matters whenever a crate stands behind the
 * target — both would intersect the same segment, and only the ordering tells
 * you which one the bean actually reached.
 */
export const stepBeans = ({
  beans,
  targets,
  arena,
  nowMs,
  dtMs,
}: StepBeansInput): StepBeansResult => {
  const seconds = Math.max(0, dtMs) / 1000;
  const survivors: Bean[] = [];
  const hits: BeanHit[] = [];

  for (const bean of beans) {
    if (bean.expiresAtMs <= nowMs) {
      continue;
    }

    const nextX = bean.x + bean.vx * seconds;
    const nextY = bean.y + bean.vy * seconds;

    let blockedAt =
      segmentExitsBounds(bean.x, bean.y, nextX, nextY, arena, BEAN.radius) ?? Infinity;

    for (const obstacle of arena.obstacles) {
      const distance = segmentIntersectsRect(bean.x, bean.y, nextX, nextY, obstacle, BEAN.radius);

      if (distance !== null && distance < blockedAt) {
        blockedAt = distance;
      }
    }

    let hitAt = Infinity;
    let victim: CombatTarget | null = null;

    for (const target of targets) {
      if (target.playerId === bean.ownerPlayerId || !isTargetable(target, nowMs)) {
        continue;
      }

      const distance = segmentIntersectsCircle(
        bean.x,
        bean.y,
        nextX,
        nextY,
        target.x,
        target.y,
        BARISTA.radius + BEAN.radius,
      );

      if (distance !== null && distance < hitAt) {
        hitAt = distance;
        victim = target;
      }
    }

    if (victim && hitAt <= blockedAt) {
      hits.push({
        beanId: bean.id,
        shooterPlayerId: bean.ownerPlayerId,
        shooterBadgeNumber: bean.ownerBadgeNumber,
        victimPlayerId: victim.playerId,
        victimBadgeNumber: victim.badgeNumber,
        x: bean.x + (nextX - bean.x) * hitAt,
        y: bean.y + (nextY - bean.y) * hitAt,
        angle: Math.atan2(bean.vy, bean.vx),
      });
      continue;
    }

    if (blockedAt <= 1) {
      continue;
    }

    survivors.push({ ...bean, x: nextX, y: nextY });
  }

  return { beans: survivors, hits };
};

// ---------------------------------------------------------------------------
// Hit resolution
// ---------------------------------------------------------------------------

export interface HitVictimState {
  readonly hearts: number;
  readonly shieldHits: number;
  readonly invulnerableUntilMs: number;
  readonly downedUntilMs: number;
}

export interface ResolveHitInput {
  readonly victim: HitVictimState;
  /** The bean's direction of travel. */
  readonly angle: number;
  readonly nowMs: number;
}

export interface HitOutcome {
  readonly hearts: number;
  readonly shieldHits: number;
  /** A shield charge absorbed the splash, so no heart was lost. */
  readonly shielded: boolean;
  readonly downed: boolean;
  readonly invulnerableUntilMs: number;
  readonly downedUntilMs: number;
  readonly knockbackVx: number;
  readonly knockbackVy: number;
}

/**
 * The verdict both phones obey without question.
 *
 * A shield charge is spent before a heart; whatever happens the victim gets
 * `INVULNERABLE_MS` of immunity, which is what stops a single triple volley
 * stripping three hearts inside one tick.
 */
export const resolveHit = ({ victim, angle, nowMs }: ResolveHitInput): HitOutcome => {
  const shielded = victim.shieldHits > 0;
  const shieldHits = shielded ? victim.shieldHits - 1 : victim.shieldHits;
  const hearts = shielded ? victim.hearts : Math.max(0, victim.hearts - 1);
  const downed = hearts <= 0;

  return {
    hearts,
    shieldHits,
    shielded,
    downed,
    invulnerableUntilMs: nowMs + HEALTH.invulnerableMs,
    downedUntilMs: downed ? nowMs + HEALTH.downedMs : victim.downedUntilMs,
    knockbackVx: Math.cos(angle) * BARISTA.knockbackSpeed,
    knockbackVy: Math.sin(angle) * BARISTA.knockbackSpeed,
  };
};

/**
 * The spawn point furthest from every live rival, so nobody comes back from a
 * refill break straight into someone's line of fire. Ties resolve to the
 * earliest spawn point, which keeps a respawn reproducible in a test.
 */
export const furthestSpawnPoint = (
  spawnPoints: readonly ArenaPoint[],
  rivals: readonly ArenaPoint[],
): ArenaPoint => {
  const first = spawnPoints[0];

  if (!first) {
    throw new Error("The arena has no spawn points");
  }

  if (rivals.length === 0) {
    return first;
  }

  let best = first;
  let bestClearance = -Infinity;

  for (const spawnPoint of spawnPoints) {
    let clearance = Infinity;

    for (const rival of rivals) {
      clearance = Math.min(clearance, Math.hypot(spawnPoint.x - rival.x, spawnPoint.y - rival.y));
    }

    if (clearance > bestClearance) {
      best = spawnPoint;
      bestClearance = clearance;
    }
  }

  return best;
};
