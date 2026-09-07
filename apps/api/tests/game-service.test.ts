import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  COUNTDOWN_MS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  PLAYER_ID_PATTERN,
  RACE_CAP_MS,
  ROOM_CODE_PATTERN,
  type GameErrorCode,
  type RaceResult,
} from "../src/modules/game/game-contract.js";
import type { GameResultRepository } from "../src/modules/game/game-result-repository.js";
import { createGameService, type GameService } from "../src/modules/game/game-service.js";
import { GameError, type NewGameResultRecord } from "../src/modules/game/game-types.js";
import { createRoomStore, type RoomStore } from "../src/modules/game/room-store.js";

const LAP_MS = 36_000;
const cleanFinish = (finishMs: number): { finishMs: number; lapSplits: number[] } => ({
  finishMs,
  lapSplits: [finishMs / 3, (finishMs / 3) * 2, finishMs],
});

const captureGameError = (action: () => void): GameError => {
  try {
    action();
  } catch (error) {
    if (error instanceof GameError) {
      return error;
    }

    throw error;
  }

  throw new Error("Expected a GameError to be thrown");
};

const expectGameError = (action: () => void, code: GameErrorCode): void => {
  expect(captureGameError(action).gameCode).toBe(code);
};

const createResultRepository = (): {
  repository: GameResultRepository;
  saved: NewGameResultRecord[];
} => {
  const saved: NewGameResultRecord[] = [];
  const toRaceResult = (record: NewGameResultRecord): RaceResult => ({
    roomCode: record.roomCode,
    trackId: record.trackId,
    finishedAt: record.finishedAt.toISOString(),
    standings: record.standings,
    payerCarNumber: record.payerCarNumber,
  });

  return {
    saved,
    repository: {
      create: (record) => {
        saved.push(record);

        return Promise.resolve(toRaceResult(record));
      },
      findLatestByRoomCode: (roomCode) => {
        const record = saved.filter((candidate) => candidate.roomCode === roomCode).at(-1);

        return Promise.resolve(record ? toRaceResult(record) : null);
      },
    },
  };
};

describe("game service", () => {
  let roomStore: RoomStore;
  let gameService: GameService;
  let results: ReturnType<typeof createResultRepository>;

  beforeEach(() => {
    vi.useFakeTimers();
    results = createResultRepository();
    roomStore = createRoomStore({ ttlMinutes: 60 });
    gameService = createGameService({
      roomStore,
      resultRepository: results.repository,
      resultTtlHours: 24,
    });
  });

  afterEach(async () => {
    await gameService.shutdown();
    vi.useRealTimers();
  });

  const seatPlayers = (count: number): { code: string; playerIds: string[] } => {
    const room = gameService.createRoom({});
    const playerIds = [room.playerId];

    for (let index = 1; index < count; index += 1) {
      playerIds.push(gameService.join(room.code, {}).playerId);
    }

    for (const playerId of playerIds) {
      gameService.attach(room.code, playerId);
    }

    return { code: room.code, playerIds };
  };

  const startRacing = (count: number): { code: string; playerIds: string[] } => {
    const seated = seatPlayers(count);

    for (const playerId of seated.playerIds) {
      gameService.setReady(seated.code, playerId, true);
    }

    gameService.startRace(seated.code, seated.playerIds[0] ?? "", false);
    vi.advanceTimersByTime(COUNTDOWN_MS);

    return seated;
  };

  it("creates rooms with unique codes and an opaque host identity", () => {
    const codes = new Set<string>();

    for (let index = 0; index < 25; index += 1) {
      const room = gameService.createRoom({});

      expect(room.code).toMatch(ROOM_CODE_PATTERN);
      expect(room.playerId).toMatch(PLAYER_ID_PATTERN);
      expect(room.state.status).toBe("LOBBY");
      expect(room.state.hostPlayerId).toBe(room.playerId);
      codes.add(room.code);
    }

    expect(codes.size).toBe(25);
  });

  it("rejects an unknown track", () => {
    expectGameError(() => gameService.createRoom({ trackId: "monaco" }), "INVALID_TRACK");
  });

  it("assigns the lowest free car number and releases it on leave", () => {
    const room = gameService.createRoom({});
    const second = gameService.join(room.code, {});
    const third = gameService.join(room.code, {});

    expect(gameService.getState(room.code).players.map((player) => player.carNumber)).toEqual([
      1, 2, 3,
    ]);

    gameService.leave(room.code, second.playerId);

    const replacement = gameService.join(room.code, {});
    const state = gameService.getState(room.code);

    expect(state.players.map((player) => player.carNumber)).toEqual([1, 3, 2]);
    expect(
      state.players.find((player) => player.playerId === replacement.playerId)?.carNumber,
    ).toBe(2);
    expect(state.players.some((player) => player.playerId === third.playerId)).toBe(true);
  });

  it("gives every player a unique colour", () => {
    const seated = seatPlayers(MAX_PLAYERS);
    const colours = gameService.getState(seated.code).players.map((player) => player.colour);

    expect(new Set(colours).size).toBe(MAX_PLAYERS);
  });

  it("rejects the seventh player with ROOM_FULL", () => {
    const seated = seatPlayers(MAX_PLAYERS);

    expectGameError(() => gameService.join(seated.code, {}), "ROOM_FULL");
  });

  it("rejects an unknown room code", () => {
    expectGameError(() => gameService.join("ZZZZ", {}), "ROOM_NOT_FOUND");
    expectGameError(() => gameService.getState("ZZZZ"), "ROOM_NOT_FOUND");
  });

  it("rejects a new player mid-race but lets a known playerId reconnect", () => {
    const racing = startRacing(2);
    const returning = racing.playerIds[1] ?? "";

    expect(gameService.getState(racing.code).status).toBe("RACING");
    expectGameError(() => gameService.join(racing.code, {}), "ROOM_IN_PROGRESS");

    gameService.disconnect(racing.code, returning);
    expect(
      gameService.getState(racing.code).players.find((player) => player.playerId === returning)
        ?.isConnected,
    ).toBe(false);

    const rejoined = gameService.join(racing.code, { playerId: returning });
    gameService.attach(racing.code, returning);

    expect(rejoined.playerId).toBe(returning);
    expect(rejoined.state.players).toHaveLength(2);
    expect(
      gameService.getState(racing.code).players.find((player) => player.playerId === returning)
        ?.isConnected,
    ).toBe(true);
  });

  it("validates car numbers, colours and emoji in the lobby", () => {
    const seated = seatPlayers(2);
    const [host, guest] = seated.playerIds;

    expectGameError(
      () =>
        gameService.setCar(seated.code, guest ?? "", { carNumber: 1, colour: null, emoji: null }),
      "NUMBER_TAKEN",
    );
    expectGameError(
      () =>
        gameService.setCar(seated.code, guest ?? "", { carNumber: 100, colour: null, emoji: null }),
      "INVALID_NUMBER",
    );
    expectGameError(
      () =>
        gameService.setCar(seated.code, guest ?? "", { carNumber: 0, colour: null, emoji: null }),
      "INVALID_NUMBER",
    );
    expectGameError(
      () =>
        gameService.setCar(seated.code, guest ?? "", {
          carNumber: null,
          colour: "maroon",
          emoji: null,
        }),
      "COLOUR_TAKEN",
    );
    expectGameError(
      () =>
        gameService.setCar(seated.code, guest ?? "", {
          carNumber: null,
          colour: "chartreuse",
          emoji: null,
        }),
      "INVALID_COLOUR",
    );
    expectGameError(
      () =>
        gameService.setCar(seated.code, guest ?? "", {
          carNumber: null,
          colour: null,
          emoji: "<script>",
        }),
      "INVALID_EMOJI",
    );

    gameService.setCar(seated.code, guest ?? "", { carNumber: 7, colour: "plum", emoji: "☕" });

    const player = gameService
      .getState(seated.code)
      .players.find((candidate) => candidate.playerId === guest);

    expect(player).toMatchObject({ carNumber: 7, colour: "plum", emoji: "☕" });
    expect(host).toBeDefined();
  });

  it("refuses car and ready changes once the race is under way", () => {
    const racing = startRacing(2);
    const playerId = racing.playerIds[0] ?? "";

    expectGameError(
      () => gameService.setCar(racing.code, playerId, { carNumber: 9, colour: null, emoji: null }),
      "INVALID_STATE",
    );
    expectGameError(() => gameService.setReady(racing.code, playerId, true), "INVALID_STATE");
  });

  it("only lets the host start, with enough ready players", () => {
    const seated = seatPlayers(2);
    const [host, guest] = seated.playerIds;

    expectGameError(() => gameService.startRace(seated.code, guest ?? "", false), "NOT_HOST");
    expectGameError(
      () => gameService.startRace(seated.code, host ?? "", false),
      "PLAYERS_NOT_READY",
    );

    // MIN_PLAYERS is 1, so a lone player may race — deliberate, so the track can
    // be tested on one phone. If MIN_PLAYERS goes back to 2, a solo start must
    // be refused instead.
    const solo = gameService.createRoom({});

    if (MIN_PLAYERS > 1) {
      expectGameError(
        () => gameService.startRace(solo.code, solo.playerId, true),
        "NOT_ENOUGH_PLAYERS",
      );
    } else {
      gameService.startRace(solo.code, solo.playerId, true);
      expect(gameService.getState(solo.code).status).toBe("COUNTDOWN");
    }

    gameService.startRace(seated.code, host ?? "", true);
    expect(gameService.getState(seated.code).status).toBe("COUNTDOWN");
    expectGameError(() => gameService.startRace(seated.code, host ?? "", true), "INVALID_STATE");
  });

  it("moves LOBBY to COUNTDOWN to RACING on the server clock", () => {
    const seated = seatPlayers(2);
    const host = seated.playerIds[0] ?? "";

    gameService.startRace(seated.code, host, true);

    const countdownState = gameService.getState(seated.code);
    const raceStartsAt = Date.parse(countdownState.raceStartsAt ?? "");

    expect(countdownState.status).toBe("COUNTDOWN");
    expect(raceStartsAt - Date.parse(countdownState.serverTime)).toBe(COUNTDOWN_MS);
    expect(countdownState.raceEndsAt).toBeNull();

    vi.advanceTimersByTime(COUNTDOWN_MS);

    const racingState = gameService.getState(seated.code);

    expect(racingState.status).toBe("RACING");
    expect(Date.parse(racingState.raceEndsAt ?? "") - raceStartsAt).toBe(RACE_CAP_MS);
  });

  it("finishes the race once every connected player crosses the line", async () => {
    const racing = startRacing(3);
    const [first, second, third] = racing.playerIds;

    await gameService.recordFinish(racing.code, second ?? "", cleanFinish(LAP_MS * 3));
    expect(gameService.getState(racing.code).status).toBe("RACING");

    await gameService.recordFinish(racing.code, first ?? "", cleanFinish(LAP_MS * 3 + 4_000));
    await gameService.recordFinish(racing.code, third ?? "", cleanFinish(LAP_MS * 3 + 9_000));

    expect(gameService.getState(racing.code).status).toBe("RESULTS");
    expect(results.saved).toHaveLength(1);

    const saved = results.saved[0];

    expect(saved?.roomCode).toBe(racing.code);
    expect(saved?.standings.map((standing) => standing.carNumber)).toEqual([2, 1, 3]);
    expect(saved?.standings.map((standing) => standing.rank)).toEqual([1, 2, 3]);
    expect(saved?.payerCarNumber).toBe(3);
    expect(saved?.expiresAt.getTime()).toBe(
      (saved?.finishedAt.getTime() ?? 0) + 24 * 60 * 60 * 1000,
    );
  });

  it("clamps and flags an implausible finish instead of trusting it", async () => {
    const racing = startRacing(2);
    const [cheater, honest] = racing.playerIds;

    await gameService.recordFinish(racing.code, cheater ?? "", {
      finishMs: 1_200,
      lapSplits: [400, 800, 1_200],
    });
    await gameService.recordFinish(racing.code, honest ?? "", cleanFinish(LAP_MS * 3));

    const standings = results.saved[0]?.standings ?? [];

    expect(standings[0]).toMatchObject({ carNumber: 2, rank: 1, suspect: false });
    expect(standings[1]).toMatchObject({
      carNumber: 1,
      rank: 2,
      suspect: true,
      finishMs: RACE_CAP_MS,
    });
    expect(results.saved[0]?.payerCarNumber).toBe(1);
  });

  it("ends the race at the hard cap and ranks the field by progress", async () => {
    const racing = startRacing(3);
    const [first, second, third] = racing.playerIds;

    await gameService.recordFinish(racing.code, third ?? "", cleanFinish(LAP_MS * 3));
    gameService.recordPosition(racing.code, first ?? "", {
      x: 1,
      y: 2,
      heading: 0,
      lap: 1,
      progress: 1.25,
    });
    gameService.recordPosition(racing.code, second ?? "", {
      x: 3,
      y: 4,
      heading: 0,
      lap: 2,
      progress: 2.75,
    });

    await vi.advanceTimersByTimeAsync(RACE_CAP_MS);

    const standings = results.saved[0]?.standings ?? [];

    expect(gameService.getState(racing.code).status).toBe("RESULTS");
    expect(standings.map((standing) => standing.carNumber)).toEqual([3, 2, 1]);
    expect(standings[1]).toMatchObject({ finishMs: null, progress: 2.75, lapsCompleted: 2 });
    expect(standings[2]).toMatchObject({ finishMs: null, progress: 1.25, lapsCompleted: 1 });
    expect(results.saved[0]?.payerCarNumber).toBe(1);
  });

  it("ignores position and finish reports outside a running race", async () => {
    const seated = seatPlayers(2);
    const host = seated.playerIds[0] ?? "";

    expect(
      gameService.recordPosition(seated.code, host, {
        x: 0,
        y: 0,
        heading: 0,
        lap: 0,
        progress: 1,
      }),
    ).toBeNull();

    await expect(
      gameService.recordFinish(seated.code, host, cleanFinish(LAP_MS * 3)),
    ).rejects.toThrowError(GameError);
  });

  it("promotes the next player when the host leaves and closes an empty room", () => {
    const seated = seatPlayers(3);
    const [host, second, third] = seated.playerIds;

    gameService.leave(seated.code, host ?? "");

    const state = gameService.getState(seated.code);

    expect(state.hostPlayerId).toBe(second);
    expect(state.players[0]).toMatchObject({ playerId: second, isHost: true });

    gameService.leave(seated.code, second ?? "");
    gameService.leave(seated.code, third ?? "");

    expect(roomStore.get(seated.code)).toBeUndefined();
    expectGameError(() => gameService.getState(seated.code), "ROOM_NOT_FOUND");
  });

  it("returns to the lobby on a host rematch and keeps the players", async () => {
    const racing = startRacing(2);
    const [host, guest] = racing.playerIds;

    await gameService.recordFinish(racing.code, host ?? "", cleanFinish(LAP_MS * 3));
    await gameService.recordFinish(racing.code, guest ?? "", cleanFinish(LAP_MS * 3 + 2_000));

    expectGameError(() => gameService.rematch(racing.code, guest ?? ""), "NOT_HOST");

    gameService.rematch(racing.code, host ?? "");

    const state = gameService.getState(racing.code);

    expect(state.status).toBe("LOBBY");
    expect(state.raceStartsAt).toBeNull();
    expect(state.players).toHaveLength(2);
    expect(state.players.every((player) => !player.isReady)).toBe(true);
    expectGameError(() => gameService.rematch(racing.code, host ?? ""), "INVALID_STATE");
  });

  it("notifies the listener about every meaningful change", async () => {
    const listener = {
      roomState: vi.fn(),
      countdown: vi.fn(),
      go: vi.fn(),
      playerFinished: vi.fn(),
      results: vi.fn(),
      contact: vi.fn(),
    };

    gameService.setListener(listener);

    const racing = startRacing(2);
    const [host, guest] = racing.playerIds;

    await gameService.recordFinish(racing.code, host ?? "", cleanFinish(LAP_MS * 3));
    await gameService.recordFinish(racing.code, guest ?? "", cleanFinish(LAP_MS * 3 + 1_000));

    expect(listener.countdown).toHaveBeenCalledTimes(1);
    expect(listener.go).toHaveBeenCalledTimes(1);
    expect(listener.playerFinished).toHaveBeenNthCalledWith(1, racing.code, {
      carNumber: 1,
      rank: 1,
      finishMs: LAP_MS * 3,
    });
    expect(listener.results).toHaveBeenCalledTimes(1);
    expect(listener.roomState).toHaveBeenCalled();
  });

  it("expires an idle room and reports it as not found", () => {
    const seated = seatPlayers(2);

    vi.advanceTimersByTime(61 * 60_000);

    expectGameError(() => gameService.getState(seated.code), "ROOM_NOT_FOUND");
    expect(roomStore.get(seated.code)).toBeUndefined();
  });
});
