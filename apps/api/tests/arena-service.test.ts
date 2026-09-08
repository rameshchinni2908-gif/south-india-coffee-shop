import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  COUNTDOWN_MS,
  HEALTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_ID_PATTERN,
  ROOM_CODE_PATTERN,
  ROUND_MS,
  WEAPON,
  type ArenaErrorCode,
  type ArenaResult,
} from "../src/modules/arena/arena-contract.js";
import type { ArenaResultRepository } from "../src/modules/arena/arena-result-repository.js";
import {
  createArenaRoomStore,
  type ArenaRoomStore,
} from "../src/modules/arena/arena-room-store.js";
import { createArenaService, type ArenaService } from "../src/modules/arena/arena-service.js";
import { ArenaError, type NewArenaResultRecord } from "../src/modules/arena/arena-types.js";

/** A lane clear of every obstacle, so a test shot has an open line. */
const CLEAR_LANE_Y = 1120;

const captureArenaError = (action: () => void): ArenaError => {
  try {
    action();
  } catch (error) {
    if (error instanceof ArenaError) {
      return error;
    }

    throw error;
  }

  throw new Error("Expected an ArenaError to be thrown");
};

const expectArenaError = (action: () => void, code: ArenaErrorCode): void => {
  expect(captureArenaError(action).arenaCode).toBe(code);
};

const createResultRepository = (): {
  repository: ArenaResultRepository;
  saved: NewArenaResultRecord[];
} => {
  const saved: NewArenaResultRecord[] = [];
  const toArenaResult = (record: NewArenaResultRecord): ArenaResult => ({
    roomCode: record.roomCode,
    arenaId: record.arenaId,
    finishedAt: record.finishedAt.toISOString(),
    standings: record.standings,
    payerBadgeNumber: record.payerBadgeNumber,
  });

  return {
    saved,
    repository: {
      create: (record) => {
        saved.push(record);

        return Promise.resolve(toArenaResult(record));
      },
      findLatestByRoomCode: (roomCode) => {
        const record = saved.filter((candidate) => candidate.roomCode === roomCode).at(-1);

        return Promise.resolve(record ? toArenaResult(record) : null);
      },
    },
  };
};

describe("arena service", () => {
  let roomStore: ArenaRoomStore;
  let arenaService: ArenaService;
  let results: ReturnType<typeof createResultRepository>;

  beforeEach(() => {
    vi.useFakeTimers();
    lastPose.clear();
    results = createResultRepository();
    roomStore = createArenaRoomStore({ ttlMinutes: 60 });
    arenaService = createArenaService({
      roomStore,
      resultRepository: results.repository,
      resultTtlHours: 24,
    });
  });

  afterEach(async () => {
    await arenaService.shutdown();
    vi.useRealTimers();
  });

  const seatPlayers = (count: number): { code: string; playerIds: string[] } => {
    const room = arenaService.createRoom({});
    const playerIds = [room.playerId];

    for (let index = 1; index < count; index += 1) {
      playerIds.push(arenaService.join(room.code, {}).playerId);
    }

    for (const playerId of playerIds) {
      arenaService.attach(room.code, playerId);
    }

    return { code: room.code, playerIds };
  };

  const startBattle = (count: number): { code: string; playerIds: string[] } => {
    const seated = seatPlayers(count);

    for (const playerId of seated.playerIds) {
      arenaService.setReady(seated.code, playerId, true);
    }

    arenaService.startRound(seated.code, seated.playerIds[0] ?? "", false);
    vi.advanceTimersByTime(COUNTDOWN_MS);

    return seated;
  };

  /**
   * Where the server last told us a barista stands.
   *
   * Tracked here rather than queried, because there is no read-only way to ask:
   * `recordPosition` is a report, so using it to "look" would move the player to
   * whatever point the look reported.
   */
  const lastPose = new Map<string, { x: number; y: number }>();

  const report = (code: string, playerId: string, x: number, y: number): void => {
    const ghost = arenaService.recordPosition(code, playerId, { x, y, aim: 0 });

    if (ghost) {
      lastPose.set(playerId, { x: ghost.x, y: ghost.y });
    }
  };

  const STEP_MS = 100;

  /**
   * Asks for a point repeatedly until the server has actually put us there.
   *
   * Each packet is clamped to one step of the speed budget and the accepted
   * position comes back in the ghost, so converging this way needs no knowledge
   * of where the barista started — which matters, because the round seeds every
   * player at a spawn point the test never sees.
   */
  const converge = (code: string, playerId: string, x: number, y: number): void => {
    for (let step = 0; step < 120; step += 1) {
      const current = lastPose.get(playerId);

      if (current && Math.hypot(x - current.x, y - current.y) < 1.5) {
        return;
      }

      vi.advanceTimersByTime(STEP_MS);
      report(code, playerId, x, y);
    }
  };

  /**
   * Walks a barista to a point, because a single teleport is exactly what the
   * server refuses to accept. The route is two axis-aligned legs — down the
   * spawn column, then along `CLEAR_LANE_Y` — so it never has to squeeze past
   * cover, which would stall the walk against the push-out.
   */
  const walkTo = (code: string, playerId: string, x: number, y: number): void => {
    // One packet to discover where the server currently has us.
    vi.advanceTimersByTime(STEP_MS);
    report(code, playerId, x, y);

    const start = lastPose.get(playerId);

    if (start) {
      converge(code, playerId, start.x, y);
    }

    converge(code, playerId, x, y);
  };

  /** The server's own record of where a barista is. Pure read — moves nobody. */
  const positionOf = (playerId: string): { x: number; y: number } =>
    lastPose.get(playerId) ?? { x: 0, y: 0 };

  const playerIn = (
    code: string,
    playerId: string,
  ): { hearts: number; hits: number; taken: number; downs: number } => {
    const player = arenaService
      .getState(code)
      .players.find((candidate) => candidate.playerId === playerId);

    return {
      hearts: player?.hearts ?? -1,
      hits: player?.hits ?? -1,
      taken: player?.taken ?? -1,
      downs: player?.downs ?? -1,
    };
  };

  /**
   * Navigating between screens tears down one socket and opens another, and the
   * two events can reach the server in either order. If a late disconnect from
   * the socket the player has already left can still un-seat them, the lobby
   * shows live players as offline and the host can no longer start — which is
   * what "the rematch sometimes does nothing" actually looks like.
   */
  it("ignores a late disconnect from a socket the player has already replaced", () => {
    const seated = seatPlayers(2);
    const playerId = seated.playerIds[1] ?? "";

    arenaService.setReady(seated.code, playerId, true);

    // The new screen's socket lands before the old screen's disconnect arrives.
    arenaService.attach(seated.code, playerId, "socket-new");
    arenaService.disconnect(seated.code, playerId, "socket-old");

    const player = arenaService
      .getState(seated.code)
      .players.find((candidate) => candidate.playerId === playerId);

    expect(player?.isConnected).toBe(true);
    expect(player?.isReady).toBe(true);
  });

  it("still disconnects when the current socket is the one that dropped", () => {
    const seated = seatPlayers(2);
    const playerId = seated.playerIds[1] ?? "";

    arenaService.attach(seated.code, playerId, "socket-a");
    arenaService.disconnect(seated.code, playerId, "socket-a");

    const player = arenaService
      .getState(seated.code)
      .players.find((candidate) => candidate.playerId === playerId);

    expect(player?.isConnected).toBe(false);
  });

  /**
   * A phone that locks never sends `room:leave`, so before this the badge stayed
   * with a player who was gone and nobody could ever start the rematch.
   */
  it("hands the host badge to someone present when the host drops", () => {
    const seated = seatPlayers(3);
    const [host, second] = seated.playerIds as [string, string];

    arenaService.disconnect(seated.code, host);

    const state = arenaService.getState(seated.code);

    expect(state.hostPlayerId).toBe(second);
    expect(state.players.find((p) => p.playerId === second)?.isHost).toBe(true);
    // The original keeps their seat, just not the badge.
    expect(state.players.find((p) => p.playerId === host)?.isHost).toBe(false);
    expect(state.players).toHaveLength(3);
  });

  it("lets the new host start a rematch after the old one drops", () => {
    const battle = startBattle(2);
    const [host, second] = battle.playerIds as [string, string];

    vi.advanceTimersByTime(ROUND_MS + 1_000);
    expect(arenaService.getState(battle.code).status).toBe("RESULTS");

    arenaService.disconnect(battle.code, host);
    arenaService.rematch(battle.code, second);

    expect(arenaService.getState(battle.code).status).toBe("LOBBY");
  });

  it("keeps the badge when the host is the only one connected", () => {
    const seated = seatPlayers(2);
    const [host, second] = seated.playerIds as [string, string];

    arenaService.disconnect(seated.code, second);
    arenaService.disconnect(seated.code, host);

    expect(arenaService.getState(seated.code).hostPlayerId).toBe(host);
  });

  it("creates rooms with unique codes and an opaque host identity", () => {
    const codes = new Set<string>();

    for (let index = 0; index < 25; index += 1) {
      const room = arenaService.createRoom({});

      expect(room.code).toMatch(ROOM_CODE_PATTERN);
      expect(room.playerId).toMatch(PLAYER_ID_PATTERN);
      expect(room.state.status).toBe("LOBBY");
      expect(room.state.hostPlayerId).toBe(room.playerId);
      codes.add(room.code);
    }

    expect(codes.size).toBe(25);
  });

  it("rejects an unknown arena", () => {
    expectArenaError(() => arenaService.createRoom({ arenaId: "colosseum" }), "INVALID_ARENA");
  });

  it("assigns the lowest free badge number and releases it on leave", () => {
    const room = arenaService.createRoom({});
    const second = arenaService.join(room.code, {});
    const third = arenaService.join(room.code, {});

    expect(arenaService.getState(room.code).players.map((player) => player.badgeNumber)).toEqual([
      1, 2, 3,
    ]);

    arenaService.leave(room.code, second.playerId);

    const replacement = arenaService.join(room.code, {});
    const state = arenaService.getState(room.code);

    expect(state.players.map((player) => player.badgeNumber)).toEqual([1, 3, 2]);
    expect(
      state.players.find((player) => player.playerId === replacement.playerId)?.badgeNumber,
    ).toBe(2);
    expect(state.players.some((player) => player.playerId === third.playerId)).toBe(true);
  });

  it("gives every player a unique colour", () => {
    const seated = seatPlayers(MAX_PLAYERS);
    const colours = arenaService.getState(seated.code).players.map((player) => player.colour);

    expect(new Set(colours).size).toBe(MAX_PLAYERS);
  });

  it("rejects the seventh player with ROOM_FULL", () => {
    const seated = seatPlayers(MAX_PLAYERS);

    expectArenaError(() => arenaService.join(seated.code, {}), "ROOM_FULL");
  });

  it("rejects an unknown or expired room", () => {
    const room = arenaService.createRoom({});

    expectArenaError(() => arenaService.join("ZZZZ", {}), "ROOM_NOT_FOUND");
    expectArenaError(() => arenaService.getState("ZZZZ"), "ROOM_NOT_FOUND");

    vi.advanceTimersByTime(61 * 60_000);
    expectArenaError(() => arenaService.getState(room.code), "ROOM_NOT_FOUND");
  });

  it("rejects a new player mid-round but lets a known playerId reconnect", () => {
    const battle = startBattle(2);
    const returning = battle.playerIds[1] ?? "";

    expect(arenaService.getState(battle.code).status).toBe("BATTLE");
    expectArenaError(() => arenaService.join(battle.code, {}), "ROOM_IN_PROGRESS");

    arenaService.disconnect(battle.code, returning);
    expect(
      arenaService.getState(battle.code).players.find((player) => player.playerId === returning)
        ?.isConnected,
    ).toBe(false);

    const rejoined = arenaService.join(battle.code, { playerId: returning });

    arenaService.attach(battle.code, returning);

    expect(rejoined.playerId).toBe(returning);
    expect(rejoined.state.players).toHaveLength(2);
    expect(
      arenaService.getState(battle.code).players.find((player) => player.playerId === returning)
        ?.isConnected,
    ).toBe(true);
  });

  it("validates badge numbers, colours and emoji in the lobby", () => {
    const seated = seatPlayers(2);
    const [host, guest] = seated.playerIds;

    expectArenaError(
      () =>
        arenaService.setBadge(seated.code, guest ?? "", {
          badgeNumber: 1,
          colour: null,
          emoji: null,
        }),
      "NUMBER_TAKEN",
    );
    expectArenaError(
      () =>
        arenaService.setBadge(seated.code, guest ?? "", {
          badgeNumber: 100,
          colour: null,
          emoji: null,
        }),
      "INVALID_NUMBER",
    );
    expectArenaError(
      () =>
        arenaService.setBadge(seated.code, guest ?? "", {
          badgeNumber: 0,
          colour: null,
          emoji: null,
        }),
      "INVALID_NUMBER",
    );
    expectArenaError(
      () =>
        arenaService.setBadge(seated.code, guest ?? "", {
          badgeNumber: null,
          colour: "maroon",
          emoji: null,
        }),
      "COLOUR_TAKEN",
    );
    expectArenaError(
      () =>
        arenaService.setBadge(seated.code, guest ?? "", {
          badgeNumber: null,
          colour: "chartreuse",
          emoji: null,
        }),
      "INVALID_COLOUR",
    );
    expectArenaError(
      () =>
        arenaService.setBadge(seated.code, guest ?? "", {
          badgeNumber: null,
          colour: null,
          emoji: "<script>",
        }),
      "INVALID_EMOJI",
    );

    arenaService.setBadge(seated.code, guest ?? "", {
      badgeNumber: 7,
      colour: "plum",
      emoji: "☕",
    });

    const player = arenaService
      .getState(seated.code)
      .players.find((candidate) => candidate.playerId === guest);

    expect(player).toMatchObject({ badgeNumber: 7, colour: "plum", emoji: "☕" });
    expect(host).toBeDefined();
  });

  it("refuses badge and ready changes once the round is under way", () => {
    const battle = startBattle(2);
    const playerId = battle.playerIds[0] ?? "";

    expectArenaError(
      () =>
        arenaService.setBadge(battle.code, playerId, {
          badgeNumber: 9,
          colour: null,
          emoji: null,
        }),
      "INVALID_STATE",
    );
    expectArenaError(() => arenaService.setReady(battle.code, playerId, true), "INVALID_STATE");
  });

  it("only lets the host start, with enough ready players", () => {
    const seated = seatPlayers(2);
    const [host, guest] = seated.playerIds;

    expectArenaError(() => arenaService.startRound(seated.code, guest ?? "", false), "NOT_HOST");
    expectArenaError(
      () => arenaService.startRound(seated.code, host ?? "", false),
      "PLAYERS_NOT_READY",
    );

    // MIN_PLAYERS is 1, so a lone barista may fight — deliberate, so the arena
    // can be tested on one phone. If MIN_PLAYERS goes back to 2, a solo start
    // must be refused instead.
    const solo = arenaService.createRoom({});

    if (MIN_PLAYERS > 1) {
      expectArenaError(
        () => arenaService.startRound(solo.code, solo.playerId, true),
        "NOT_ENOUGH_PLAYERS",
      );
    } else {
      arenaService.startRound(solo.code, solo.playerId, true);
      expect(arenaService.getState(solo.code).status).toBe("COUNTDOWN");
    }

    arenaService.startRound(seated.code, host ?? "", true);
    expect(arenaService.getState(seated.code).status).toBe("COUNTDOWN");
    expectArenaError(() => arenaService.startRound(seated.code, host ?? "", true), "INVALID_STATE");
  });

  it("moves LOBBY to COUNTDOWN to BATTLE on the server clock", () => {
    const seated = seatPlayers(2);
    const host = seated.playerIds[0] ?? "";

    arenaService.startRound(seated.code, host, true);

    const countdownState = arenaService.getState(seated.code);
    const roundStartsAt = Date.parse(countdownState.roundStartsAt ?? "");

    expect(countdownState.status).toBe("COUNTDOWN");
    expect(roundStartsAt - Date.parse(countdownState.serverTime)).toBe(COUNTDOWN_MS);
    expect(countdownState.roundEndsAt).toBeNull();

    vi.advanceTimersByTime(COUNTDOWN_MS);

    const battleState = arenaService.getState(seated.code);

    expect(battleState.status).toBe("BATTLE");
    expect(Date.parse(battleState.roundEndsAt ?? "") - roundStartsAt).toBe(ROUND_MS);
  });

  it("promotes the next player when the host leaves, and closes an empty room", () => {
    const seated = seatPlayers(2);
    const [host, guest] = seated.playerIds;

    arenaService.leave(seated.code, host ?? "");

    const state = arenaService.getState(seated.code);

    expect(state.hostPlayerId).toBe(guest);
    expect(state.players[0]).toMatchObject({ playerId: guest, isHost: true });

    arenaService.leave(seated.code, guest ?? "");
    expectArenaError(() => arenaService.getState(seated.code), "ROOM_NOT_FOUND");
  });

  it("resolves a splash on the server and never from a client", () => {
    const battle = startBattle(2);
    const [attacker, victim] = battle.playerIds;

    walkTo(battle.code, attacker ?? "", 400, CLEAR_LANE_Y);
    walkTo(battle.code, victim ?? "", 700, CLEAR_LANE_Y);

    expect(positionOf(attacker ?? "")).toMatchObject({ x: 400, y: CLEAR_LANE_Y });
    expect(positionOf(victim ?? "")).toMatchObject({ x: 700, y: CLEAR_LANE_Y });

    arenaService.recordFire(battle.code, attacker ?? "", { x: 400, y: CLEAR_LANE_Y, angle: 0 });
    vi.advanceTimersByTime(800);

    expect(playerIn(battle.code, attacker ?? "")).toMatchObject({ hits: 1, taken: 0 });
    expect(playerIn(battle.code, victim ?? "")).toMatchObject({
      hits: 0,
      taken: 1,
      hearts: HEALTH.startHearts - 1,
    });
  });

  it("spends ammo, refuses a shot below the cadence floor and reloads on a timer", () => {
    const battle = startBattle(2);
    const attacker = battle.playerIds[0] ?? "";
    const ammo: number[] = [];

    arenaService.setListener({
      roomState: () => undefined,
      countdown: () => undefined,
      go: () => undefined,
      shot: () => undefined,
      hit: () => undefined,
      respawn: () => undefined,
      ammo: (_code, _playerId, payload) => ammo.push(payload.ammo),
      pad: () => undefined,
      power: () => undefined,
      scores: () => undefined,
      results: () => undefined,
    });

    walkTo(battle.code, attacker, 400, CLEAR_LANE_Y);

    for (let shot = 0; shot < WEAPON.clipSize; shot += 1) {
      arenaService.recordFire(battle.code, attacker, { x: 400, y: CLEAR_LANE_Y, angle: 0 });
      vi.advanceTimersByTime(WEAPON.fireIntervalMs);
    }

    expect(ammo).toEqual([5, 4, 3, 2, 1, 0]);

    // The clip is empty, so the next throw is dropped without a bean.
    arenaService.recordFire(battle.code, attacker, { x: 400, y: CLEAR_LANE_Y, angle: 0 });
    expect(ammo).toEqual([5, 4, 3, 2, 1, 0]);

    arenaService.requestReload(battle.code, attacker);
    expect(ammo.at(-1)).toBe(0);

    vi.advanceTimersByTime(WEAPON.reloadMs + 100);
    expect(ammo.at(-1)).toBe(WEAPON.clipSize);

    // A second throw inside the server's floor is dropped silently.
    arenaService.recordFire(battle.code, attacker, { x: 400, y: CLEAR_LANE_Y, angle: 0 });
    const afterFirst = ammo.at(-1);

    arenaService.recordFire(battle.code, attacker, { x: 400, y: CLEAR_LANE_Y, angle: 0 });
    expect(ammo.at(-1)).toBe(afterFirst);
  });

  it("drops a shot whose reported origin has drifted from the server's position", () => {
    const battle = startBattle(2);
    const [attacker, victim] = battle.playerIds;

    walkTo(battle.code, attacker ?? "", 400, CLEAR_LANE_Y);
    walkTo(battle.code, victim ?? "", 700, CLEAR_LANE_Y);

    arenaService.recordFire(battle.code, attacker ?? "", {
      x: 400 + WEAPON.maxOriginDrift + 50,
      y: CLEAR_LANE_Y,
      angle: 0,
    });
    vi.advanceTimersByTime(800);

    expect(playerIn(battle.code, victim ?? "")).toMatchObject({ taken: 0 });
  });

  it("flags a teleporting phone as suspect and clamps it", async () => {
    const battle = startBattle(2);
    const cheat = battle.playerIds[0] ?? "";

    vi.advanceTimersByTime(100);

    const ghost = arenaService.recordPosition(battle.code, cheat, {
      x: 1_500,
      y: CLEAR_LANE_Y,
      aim: 0,
    });

    expect(ghost?.x).toBeLessThan(1_000);

    await vi.advanceTimersByTimeAsync(ROUND_MS);

    const standing = results.saved[0]?.standings.find((entry) => entry.badgeNumber === 1);

    expect(standing?.suspect).toBe(true);
  });

  it("sends a barista out of hearts for a refill break and brings them back", async () => {
    const battle = startBattle(2);
    const [attacker, victim] = battle.playerIds;

    walkTo(battle.code, attacker ?? "", 400, CLEAR_LANE_Y);
    walkTo(battle.code, victim ?? "", 700, CLEAR_LANE_Y);

    for (let shot = 0; shot < HEALTH.startHearts; shot += 1) {
      arenaService.recordFire(battle.code, attacker ?? "", { x: 400, y: CLEAR_LANE_Y, angle: 0 });
      // Long enough for the bean to land and the immunity window to lapse.
      vi.advanceTimersByTime(HEALTH.invulnerableMs + 400);
    }

    expect(playerIn(battle.code, victim ?? "")).toMatchObject({ hearts: 0, downs: 1, taken: 3 });
    expect(playerIn(battle.code, attacker ?? "")).toMatchObject({ hits: 3 });

    vi.advanceTimersByTime(HEALTH.downedMs + COUNTDOWN_MS);

    // Back in with fewer hearts than a fresh start: being downed costs you
    // something without putting you out of the round.
    expect(playerIn(battle.code, victim ?? "")).toMatchObject({ hearts: HEALTH.respawnHearts });

    await vi.advanceTimersByTimeAsync(ROUND_MS);
  });

  it("blows the whistle at 120 seconds and ranks the field by splashes landed", async () => {
    const battle = startBattle(3);
    const [attacker, victim] = battle.playerIds;

    walkTo(battle.code, attacker ?? "", 400, CLEAR_LANE_Y);
    walkTo(battle.code, victim ?? "", 700, CLEAR_LANE_Y);

    arenaService.recordFire(battle.code, attacker ?? "", { x: 400, y: CLEAR_LANE_Y, angle: 0 });
    vi.advanceTimersByTime(800);

    expect(arenaService.getState(battle.code).status).toBe("BATTLE");

    await vi.advanceTimersByTimeAsync(ROUND_MS);

    const saved = results.saved[0];

    expect(arenaService.getState(battle.code).status).toBe("RESULTS");
    expect(results.saved).toHaveLength(1);
    expect(saved?.roomCode).toBe(battle.code);
    // Badge 1 landed the only splash; badge 2 took it; badge 3 did neither, so
    // the tie between 2 and 3 on zero hits is broken by splashes taken.
    expect(saved?.standings.map((standing) => standing.badgeNumber)).toEqual([1, 3, 2]);
    expect(saved?.standings.map((standing) => standing.rank)).toEqual([1, 2, 3]);
    expect(saved?.payerBadgeNumber).toBe(2);
    expect(saved?.expiresAt.getTime()).toBe(
      (saved?.finishedAt.getTime() ?? 0) + 24 * 60 * 60 * 1000,
    );
  });

  it("keeps a disconnected barista in the field and ranks them on what they scored", async () => {
    const battle = startBattle(2);
    const [attacker, victim] = battle.playerIds;

    walkTo(battle.code, attacker ?? "", 400, CLEAR_LANE_Y);
    walkTo(battle.code, victim ?? "", 700, CLEAR_LANE_Y);
    arenaService.disconnect(battle.code, victim ?? "");

    // The barista stops moving but is still standing there, so it is still a
    // valid target (§5).
    arenaService.recordFire(battle.code, attacker ?? "", { x: 400, y: CLEAR_LANE_Y, angle: 0 });
    vi.advanceTimersByTime(800);

    expect(playerIn(battle.code, victim ?? "")).toMatchObject({ taken: 1 });

    await vi.advanceTimersByTimeAsync(ROUND_MS);

    const standings = results.saved[0]?.standings ?? [];

    expect(standings[1]).toMatchObject({ badgeNumber: 2, rank: 2, disconnected: true, taken: 1 });
    expect(results.saved[0]?.payerBadgeNumber).toBe(2);
  });

  it("returns to the lobby on a rematch, keeping the players and clearing the score", async () => {
    const battle = startBattle(2);
    const [host, guest] = battle.playerIds;

    walkTo(battle.code, host ?? "", 400, CLEAR_LANE_Y);
    walkTo(battle.code, guest ?? "", 700, CLEAR_LANE_Y);
    arenaService.recordFire(battle.code, host ?? "", { x: 400, y: CLEAR_LANE_Y, angle: 0 });
    vi.advanceTimersByTime(800);

    await vi.advanceTimersByTimeAsync(ROUND_MS);

    expectArenaError(() => arenaService.rematch(battle.code, guest ?? ""), "NOT_HOST");
    arenaService.rematch(battle.code, host ?? "");

    const state = arenaService.getState(battle.code);

    expect(state.status).toBe("LOBBY");
    expect(state.players).toHaveLength(2);
    expect(state.players.every((player) => player.hits === 0 && !player.isReady)).toBe(true);
    expect(state.players.every((player) => player.hearts === HEALTH.startHearts)).toBe(true);
    expectArenaError(() => arenaService.rematch(battle.code, host ?? ""), "INVALID_STATE");
  });

  it("ignores position, fire and reload requests outside a running round", () => {
    const seated = seatPlayers(2);
    const playerId = seated.playerIds[0] ?? "";

    expect(
      arenaService.recordPosition(seated.code, playerId, { x: 400, y: CLEAR_LANE_Y, aim: 0 }),
    ).toBeNull();

    arenaService.recordFire(seated.code, playerId, { x: 400, y: CLEAR_LANE_Y, angle: 0 });
    arenaService.requestReload(seated.code, playerId);

    expect(arenaService.getState(seated.code).status).toBe("LOBBY");
  });

  it("stores the round result behind a TTL and serves it back", async () => {
    const battle = startBattle(2);

    await vi.advanceTimersByTimeAsync(ROUND_MS);

    const stored = await arenaService.getResult(battle.code);

    expect(stored.roomCode).toBe(battle.code);
    expect(stored.standings).toHaveLength(2);
    await expect(arenaService.getResult("ZZZZ")).rejects.toThrow();
  });
});
