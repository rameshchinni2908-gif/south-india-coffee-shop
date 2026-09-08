import { describe, expect, it } from "vitest";

import {
  contactPairKey,
  pruneContactCooldowns,
  resolveContacts,
} from "../src/modules/game/contacts.js";
import { RAM } from "../src/modules/game/game-contract.js";
import type { RoomPlayer } from "../src/modules/game/game-types.js";

const player = (
  carNumber: number,
  x: number,
  y: number,
  heading: number,
  overrides: Partial<RoomPlayer> = {},
): RoomPlayer => ({
  playerId: `player-${carNumber}`,
  carNumber,
  colour: "maroon",
  emoji: null,
  isReady: true,
  isConnected: true,
  connectionId: `socket-${carNumber}`,
  isHost: carNumber === 1,
  joinedAt: new Date(0),
  finishMs: null,
  progress: 1,
  lapsCompleted: 1,
  suspect: false,
  finishOrder: null,
  lastX: x,
  lastY: y,
  lastHeading: heading,
  ...overrides,
});

describe("ram resolution", () => {
  it("keys a pair the same whichever car is asked about first", () => {
    expect(contactPairKey(3, 11)).toBe(contactPairKey(11, 3));
    expect(contactPairKey(3, 11)).toBe("3:11");
  });

  // The whole reason this lives on the server: from each phone's own point of
  // view it is always the one doing the ramming.
  it("names exactly one aggressor for a nose-to-tail shunt", () => {
    // Car 1 sits 20 units behind car 2 and is driving straight at it.
    const chaser = player(1, 0, 0, 0);
    const leader = player(2, 20, 0, 0);

    const verdicts = resolveContacts(chaser, [chaser, leader], new Map(), 1_000);

    expect(verdicts).toEqual([{ dasherCarNumber: 1, victimCarNumber: 2 }]);
  });

  it("reaches the same verdict whichever car's packet arrives", () => {
    const chaser = player(1, 0, 0, 0);
    const leader = player(2, 20, 0, 0);

    const fromChaser = resolveContacts(chaser, [chaser, leader], new Map(), 1_000);
    const fromLeader = resolveContacts(leader, [chaser, leader], new Map(), 1_000);

    expect(fromLeader).toEqual(fromChaser);
  });

  it("ignores karts running side by side", () => {
    // Both pointing the same way, separated across the track rather than along it.
    const left = player(1, 0, 0, 0);
    const right = player(2, 0, 30, 0);

    expect(resolveContacts(left, [left, right], new Map(), 1_000)).toEqual([]);
  });

  it("ignores karts that are simply far apart", () => {
    const chaser = player(1, 0, 0, 0);
    const leader = player(2, RAM.contactRadius + 10, 0, 0);

    expect(resolveContacts(chaser, [chaser, leader], new Map(), 1_000)).toEqual([]);
  });

  it("does not award a hit for a dead-on head-to-head", () => {
    // Neither is more to blame, so nobody is rewarded.
    const north = player(1, 0, 0, 0);
    const south = player(2, 20, 0, Math.PI);

    expect(resolveContacts(north, [north, south], new Map(), 1_000)).toEqual([]);
  });

  it("suppresses repeat hits on the same pair until the cooldown expires", () => {
    const chaser = player(1, 0, 0, 0);
    const leader = player(2, 20, 0, 0);
    const cooldowns = new Map<string, number>();

    expect(resolveContacts(chaser, [chaser, leader], cooldowns, 1_000)).toHaveLength(1);
    expect(resolveContacts(chaser, [chaser, leader], cooldowns, 1_000 + 100)).toHaveLength(0);
    expect(
      resolveContacts(chaser, [chaser, leader], cooldowns, 1_000 + RAM.cooldownMs),
    ).toHaveLength(1);
  });

  it("ignores a kart that has already finished", () => {
    const chaser = player(1, 0, 0, 0);
    const done = player(2, 20, 0, 0, { finishMs: 95_000 });

    expect(resolveContacts(chaser, [chaser, done], new Map(), 1_000)).toEqual([]);
  });

  it("ignores a kart that has not reported a position yet", () => {
    const chaser = player(1, 0, 0, 0);
    const unseen = player(2, 20, 0, 0, { lastX: null, lastY: null });

    expect(resolveContacts(chaser, [chaser, unseen], new Map(), 1_000)).toEqual([]);
  });

  it("can hit two rivals at once in a pile-up", () => {
    const chaser = player(1, 0, 0, 0);
    const first = player(2, 18, 6, 0);
    const second = player(3, 18, -6, 0);

    const verdicts = resolveContacts(chaser, [chaser, first, second], new Map(), 1_000);

    expect(verdicts.map((verdict) => verdict.victimCarNumber).sort()).toEqual([2, 3]);
    expect(verdicts.every((verdict) => verdict.dasherCarNumber === 1)).toBe(true);
  });

  it("drops cooldown entries once they can no longer suppress anything", () => {
    const cooldowns = new Map<string, number>([["1:2", 1_000]]);

    pruneContactCooldowns(cooldowns, 1_000 + RAM.cooldownMs - 1);
    expect(cooldowns.size).toBe(1);

    pruneContactCooldowns(cooldowns, 1_000 + RAM.cooldownMs);
    expect(cooldowns.size).toBe(0);
  });
});
