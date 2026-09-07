/**
 * Ram resolution.
 *
 * Each phone simulates only its own kart and draws rivals from interpolated
 * position broadcasts, so neither side of a collision can be trusted to say who
 * hit whom — both would decide they were the aggressor and both would take the
 * reward. The server holds every kart's last reported pose, so it is the only
 * place a single, consistent verdict can be reached. These functions are pure
 * so that verdict is easy to test.
 */

import { RAM } from "./game-contract.js";
import type { RoomPlayer } from "./game-types.js";

export interface ContactVerdict {
  readonly dasherCarNumber: number;
  readonly victimCarNumber: number;
}

/** Stable key for a pair of cars, independent of who moved first. */
export const contactPairKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * How squarely `from` is pointing at `to`, as a dot product in [-1, 1].
 * 1 means driving straight at it; 0 means passing side-on.
 */
const aimAt = (from: RoomPlayer, toX: number, toY: number): number => {
  if (from.lastX === null || from.lastY === null) {
    return -1;
  }

  const dx = toX - from.lastX;
  const dy = toY - from.lastY;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return -1;
  }

  return (Math.cos(from.lastHeading) * dx + Math.sin(from.lastHeading) * dy) / distance;
};

const isRammable = (player: RoomPlayer): boolean =>
  player.finishMs === null && player.lastX !== null && player.lastY !== null;

/**
 * Resolves contact between the kart that just moved and everyone else.
 *
 * The aggressor is whichever kart is pointing more directly at the other, and
 * it must be aiming at least `RAM.minAim` — so a nose-to-tail shunt counts and
 * two karts drifting shoulder to shoulder do not. Head-on cases where both are
 * aiming equally are treated as nobody's fault and skipped, rather than handing
 * an arbitrary player a reward.
 */
export const resolveContacts = (
  mover: RoomPlayer,
  others: readonly RoomPlayer[],
  cooldowns: Map<string, number>,
  nowMs: number,
): ContactVerdict[] => {
  if (!isRammable(mover) || mover.lastX === null || mover.lastY === null) {
    return [];
  }

  const verdicts: ContactVerdict[] = [];

  for (const other of others) {
    if (other.playerId === mover.playerId) continue;
    if (!isRammable(other) || other.lastX === null || other.lastY === null) continue;

    const distance = Math.hypot(other.lastX - mover.lastX, other.lastY - mover.lastY);

    if (distance > RAM.contactRadius) continue;

    const key = contactPairKey(mover.carNumber, other.carNumber);
    const last = cooldowns.get(key);

    if (last !== undefined && nowMs - last < RAM.cooldownMs) continue;

    const moverAim = aimAt(mover, other.lastX, other.lastY);
    const otherAim = aimAt(other, mover.lastX, mover.lastY);

    if (moverAim === otherAim) continue;

    const moverIsDasher = moverAim > otherAim;
    const dasherAim = moverIsDasher ? moverAim : otherAim;

    if (dasherAim < RAM.minAim) continue;

    cooldowns.set(key, nowMs);
    verdicts.push({
      dasherCarNumber: moverIsDasher ? mover.carNumber : other.carNumber,
      victimCarNumber: moverIsDasher ? other.carNumber : mover.carNumber,
    });
  }

  return verdicts;
};

/** Drops cooldown entries that can no longer suppress anything. */
export const pruneContactCooldowns = (cooldowns: Map<string, number>, nowMs: number): void => {
  for (const [key, at] of cooldowns) {
    if (nowMs - at >= RAM.cooldownMs) {
      cooldowns.delete(key);
    }
  }
};
