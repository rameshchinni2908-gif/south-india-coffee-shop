import { HttpError } from "../../middleware/http-error.js";
import {
  CAR_COLOURS,
  CAR_EMOJIS,
  COUNTDOWN_MS,
  DEFAULT_TRACK_ID,
  MAX_CAR_NUMBER,
  MAX_PLAYERS,
  MIN_CAR_NUMBER,
  MIN_PLAYERS,
  RACE_CAP_MS,
  TOTAL_LAPS,
  findCarColour,
  findTrack,
  type GamePlayer,
  type GameRoomState,
  type ContactPayload,
  type GhostPayload,
  type RaceResult,
} from "./game-contract.js";
import type { GameResultRepository } from "./game-result-repository.js";
import type {
  CreateRoomInput,
  FinishPayload,
  JoinRoomInput,
  PositionPayload,
  SetCarPayload,
} from "./game-schemas.js";
import { pruneContactCooldowns, resolveContacts } from "./contacts.js";
import { GameError, type RoomPlayer, type RoomRecord } from "./game-types.js";
import { createPlayerId, type RoomStore } from "./room-store.js";
import { buildRaceOutcome, clampProgress, validateFinish, type RankingEntry } from "./standings.js";

const HOUR_MS = 3_600_000;

export interface GameServiceListener {
  roomState(code: string, state: GameRoomState): void;
  countdown(code: string, payload: { raceStartsAt: string; serverTime: string }): void;
  go(code: string, payload: { raceEndsAt: string; serverTime: string }): void;
  playerFinished(
    code: string,
    payload: { carNumber: number; rank: number; finishMs: number },
  ): void;
  results(code: string, result: RaceResult): void;
  contact(code: string, payload: ContactPayload): void;
}

export interface CreatedRoom {
  code: string;
  playerId: string;
  state: GameRoomState;
}

export interface JoinedRoom {
  playerId: string;
  state: GameRoomState;
}

export interface GameService {
  createRoom(input: CreateRoomInput): CreatedRoom;
  join(code: string, input: JoinRoomInput): JoinedRoom;
  getState(code: string): GameRoomState;
  getResult(code: string): Promise<RaceResult>;
  attach(code: string, playerId: string): GameRoomState;
  disconnect(code: string, playerId: string): void;
  leave(code: string, playerId: string): void;
  setReady(code: string, playerId: string, isReady: boolean): void;
  setCar(code: string, playerId: string, input: SetCarPayload): void;
  startRace(code: string, playerId: string, force: boolean): void;
  recordPosition(code: string, playerId: string, input: PositionPayload): GhostPayload | null;
  recordFinish(code: string, playerId: string, input: FinishPayload): Promise<void>;
  rematch(code: string, playerId: string): void;
  setListener(listener: GameServiceListener): void;
  shutdown(): Promise<void>;
}

export interface CreateGameServiceOptions {
  roomStore: RoomStore;
  resultRepository: GameResultRepository;
  resultTtlHours: number;
  now?: () => Date;
}

const noopListener: GameServiceListener = {
  roomState: () => undefined,
  countdown: () => undefined,
  go: () => undefined,
  playerFinished: () => undefined,
  results: () => undefined,
  contact: () => undefined,
};

const toGamePlayer = (player: RoomPlayer): GamePlayer => ({
  playerId: player.playerId,
  carNumber: player.carNumber,
  colour: player.colour,
  emoji: player.emoji,
  isReady: player.isReady,
  isConnected: player.isConnected,
  isHost: player.isHost,
});

const toRoomState = (room: RoomRecord, serverTime: Date): GameRoomState => ({
  code: room.code,
  status: room.status,
  trackId: room.trackId,
  hostPlayerId: room.hostPlayerId,
  players: room.players.map(toGamePlayer),
  raceStartsAt: room.raceStartsAt ? room.raceStartsAt.toISOString() : null,
  raceEndsAt: room.raceEndsAt ? room.raceEndsAt.toISOString() : null,
  serverTime: serverTime.toISOString(),
});

/** Lowest free number in 1..99, so a fresh table gets 01, 02, 03… */
const lowestFreeCarNumber = (room: RoomRecord): number => {
  const taken = new Set(room.players.map((player) => player.carNumber));

  for (let candidate = MIN_CAR_NUMBER; candidate <= MAX_CAR_NUMBER; candidate += 1) {
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  throw new GameError(409, "ROOM_FULL", "No car number is available");
};

const firstFreeColour = (room: RoomRecord): string => {
  const taken = new Set(room.players.map((player) => player.colour));
  const colour = CAR_COLOURS.find((candidate) => !taken.has(candidate.id));

  if (!colour) {
    throw new GameError(409, "ROOM_FULL", "No car colour is available");
  }

  return colour.id;
};

const resetRaceState = (player: RoomPlayer): void => {
  player.finishMs = null;
  player.progress = 0;
  player.lapsCompleted = 0;
  player.suspect = false;
  player.finishOrder = null;
  player.lastX = null;
  player.lastY = null;
  player.lastHeading = 0;
};

export const createGameService = ({
  roomStore,
  resultRepository,
  resultTtlHours,
  now = () => new Date(),
}: CreateGameServiceOptions): GameService => {
  let listener: GameServiceListener = noopListener;

  const requireRoom = (code: string): RoomRecord => {
    const room = roomStore.get(code);

    if (!room || room.status === "CLOSED") {
      throw new GameError(404, "ROOM_NOT_FOUND", "This race room is no longer available");
    }

    if (room.expiresAt.getTime() <= now().getTime()) {
      roomStore.delete(code);
      throw new GameError(404, "ROOM_NOT_FOUND", "This race room is no longer available");
    }

    return room;
  };

  const requirePlayer = (room: RoomRecord, playerId: string): RoomPlayer => {
    const player = room.players.find((candidate) => candidate.playerId === playerId);

    if (!player) {
      throw new GameError(403, "NOT_IN_ROOM", "You are not a player in this room");
    }

    return player;
  };

  const requireHost = (room: RoomRecord, playerId: string): RoomPlayer => {
    const player = requirePlayer(room, playerId);

    if (!player.isHost) {
      throw new GameError(403, "NOT_HOST", "Only the host can do that");
    }

    return player;
  };

  const publishState = (room: RoomRecord): void => {
    roomStore.touch(room);
    listener.roomState(room.code, toRoomState(room, now()));
  };

  const clearTimers = (room: RoomRecord): void => {
    if (room.timers.countdown) {
      clearTimeout(room.timers.countdown);
      room.timers.countdown = null;
    }

    if (room.timers.cap) {
      clearTimeout(room.timers.cap);
      room.timers.cap = null;
    }
  };

  const toRankingEntry = (player: RoomPlayer): RankingEntry => ({
    carNumber: player.carNumber,
    colour: player.colour,
    emoji: player.emoji,
    finishMs: player.finishMs,
    lapsCompleted: player.lapsCompleted,
    progress: player.progress,
    disconnected: !player.isConnected,
    suspect: player.suspect,
  });

  const finishRace = async (room: RoomRecord): Promise<void> => {
    if (room.status !== "RACING") {
      return;
    }

    clearTimers(room);
    room.status = "RESULTS";
    room.raceEndsAt = null;

    const finishedAt = now();
    const outcome = buildRaceOutcome(room.players.map(toRankingEntry));
    const result: RaceResult = {
      roomCode: room.code,
      trackId: room.trackId,
      finishedAt: finishedAt.toISOString(),
      standings: outcome.standings,
      payerCarNumber: outcome.payerCarNumber,
    };

    listener.results(room.code, result);
    publishState(room);

    try {
      await resultRepository.create({
        roomCode: room.code,
        trackId: room.trackId,
        finishedAt,
        standings: outcome.standings,
        payerCarNumber: outcome.payerCarNumber,
        expiresAt: new Date(finishedAt.getTime() + resultTtlHours * HOUR_MS),
      });
    } catch {
      // Results are throwaway entertainment data: a storage outage must not
      // break the race that has already been broadcast to the table.
    }
  };

  const maybeFinishRace = (room: RoomRecord): Promise<void> => {
    if (room.status !== "RACING" || room.players.length === 0) {
      return Promise.resolve();
    }

    const stillDriving = room.players.some(
      (player) => player.isConnected && player.finishMs === null,
    );

    return stillDriving ? Promise.resolve() : finishRace(room);
  };

  const beginRace = (room: RoomRecord): void => {
    if (room.status !== "COUNTDOWN" || !room.raceStartsAt) {
      return;
    }

    room.timers.countdown = null;
    room.status = "RACING";
    room.raceEndsAt = new Date(room.raceStartsAt.getTime() + RACE_CAP_MS);

    listener.go(room.code, {
      raceEndsAt: room.raceEndsAt.toISOString(),
      serverTime: now().toISOString(),
    });
    publishState(room);

    room.timers.cap = setTimeout(() => {
      room.timers.cap = null;
      void finishRace(room);
    }, RACE_CAP_MS);
  };

  const promoteHost = (room: RoomRecord): void => {
    if (room.players.some((player) => player.isHost)) {
      return;
    }

    const nextHost =
      room.players.find((player) => player.isConnected) ?? room.players.at(0) ?? null;

    if (nextHost) {
      nextHost.isHost = true;
      room.hostPlayerId = nextHost.playerId;
    }
  };

  const closeRoom = (room: RoomRecord): void => {
    clearTimers(room);
    room.status = "CLOSED";
    roomStore.delete(room.code);
  };

  return {
    createRoom(input) {
      const trackId = input.trackId ?? DEFAULT_TRACK_ID;

      if (!findTrack(trackId)) {
        throw new GameError(400, "INVALID_TRACK", "That track does not exist");
      }

      const firstColour = CAR_COLOURS[0];

      if (!firstColour) {
        throw new Error("The car colour palette is empty");
      }

      const createdAt = now();
      const playerId = createPlayerId();
      const host: RoomPlayer = {
        playerId,
        carNumber: MIN_CAR_NUMBER,
        colour: firstColour.id,
        emoji: null,
        isReady: false,
        isConnected: false,
        isHost: true,
        joinedAt: createdAt,
        finishMs: null,
        progress: 0,
        lapsCompleted: 0,
        lastX: null,
        lastY: null,
        lastHeading: 0,
        suspect: false,
        finishOrder: null,
      };
      const room: RoomRecord = {
        code: roomStore.generateCode(),
        status: "LOBBY",
        trackId,
        hostPlayerId: playerId,
        players: [host],
        raceStartsAt: null,
        raceEndsAt: null,
        lastActivityAt: createdAt,
        expiresAt: createdAt,
        timers: { countdown: null, cap: null },
        contactCooldowns: new Map<string, number>(),
      };

      roomStore.set(room);
      roomStore.touch(room);

      return { code: room.code, playerId, state: toRoomState(room, now()) };
    },

    join(code, input) {
      const room = requireRoom(code);
      const existingPlayer = input.playerId
        ? room.players.find((player) => player.playerId === input.playerId)
        : undefined;

      // A known playerId is a reconnect and must work even mid-race.
      if (existingPlayer) {
        publishState(room);

        return { playerId: existingPlayer.playerId, state: toRoomState(room, now()) };
      }

      if (room.status !== "LOBBY") {
        throw new GameError(409, "ROOM_IN_PROGRESS", "This race has already started");
      }

      if (room.players.length >= MAX_PLAYERS) {
        throw new GameError(409, "ROOM_FULL", "This race room is full");
      }

      const playerId = createPlayerId();
      const player: RoomPlayer = {
        playerId,
        carNumber: lowestFreeCarNumber(room),
        colour: firstFreeColour(room),
        emoji: null,
        isReady: false,
        isConnected: false,
        isHost: false,
        joinedAt: now(),
        finishMs: null,
        progress: 0,
        lapsCompleted: 0,
        lastX: null,
        lastY: null,
        lastHeading: 0,
        suspect: false,
        finishOrder: null,
      };

      room.players.push(player);
      publishState(room);

      return { playerId, state: toRoomState(room, now()) };
    },

    getState(code) {
      return toRoomState(requireRoom(code), now());
    },

    async getResult(code) {
      const result = await resultRepository.findLatestByRoomCode(code);

      if (!result) {
        throw new HttpError(404, "GAME_RESULT_NOT_FOUND", "No race result was found for this room");
      }

      return result;
    },

    attach(code, playerId) {
      const room = requireRoom(code);
      const player = requirePlayer(room, playerId);

      player.isConnected = true;
      publishState(room);

      return toRoomState(room, now());
    },

    disconnect(code, playerId) {
      const room = roomStore.get(code);

      if (!room) {
        return;
      }

      const player = room.players.find((candidate) => candidate.playerId === playerId);

      if (!player) {
        return;
      }

      // The slot survives: the phone may come back before the cap.
      player.isConnected = false;
      player.isReady = false;
      publishState(room);
      void maybeFinishRace(room);
    },

    leave(code, playerId) {
      const room = roomStore.get(code);

      if (!room) {
        return;
      }

      const index = room.players.findIndex((candidate) => candidate.playerId === playerId);

      if (index === -1) {
        return;
      }

      room.players.splice(index, 1);

      if (room.players.length === 0) {
        closeRoom(room);
        return;
      }

      promoteHost(room);
      publishState(room);
      void maybeFinishRace(room);
    },

    setReady(code, playerId, isReady) {
      const room = requireRoom(code);
      const player = requirePlayer(room, playerId);

      if (room.status !== "LOBBY") {
        throw new GameError(409, "INVALID_STATE", "Ready can only change in the lobby");
      }

      player.isReady = isReady;
      publishState(room);
    },

    setCar(code, playerId, input) {
      const room = requireRoom(code);
      const player = requirePlayer(room, playerId);

      if (room.status !== "LOBBY") {
        throw new GameError(409, "INVALID_STATE", "Cars can only change in the lobby");
      }

      if (input.carNumber !== null) {
        if (
          !Number.isInteger(input.carNumber) ||
          input.carNumber < MIN_CAR_NUMBER ||
          input.carNumber > MAX_CAR_NUMBER
        ) {
          throw new GameError(400, "INVALID_NUMBER", "Choose a car number between 1 and 99");
        }

        const isTaken = room.players.some(
          (candidate) => candidate.playerId !== playerId && candidate.carNumber === input.carNumber,
        );

        if (isTaken) {
          throw new GameError(409, "NUMBER_TAKEN", "That car number is already taken");
        }
      }

      if (input.colour !== null) {
        if (!findCarColour(input.colour)) {
          throw new GameError(400, "INVALID_COLOUR", "That car colour does not exist");
        }

        const isTaken = room.players.some(
          (candidate) => candidate.playerId !== playerId && candidate.colour === input.colour,
        );

        if (isTaken) {
          throw new GameError(409, "COLOUR_TAKEN", "That car colour is already taken");
        }
      }

      if (input.emoji !== null && !CAR_EMOJIS.includes(input.emoji)) {
        throw new GameError(400, "INVALID_EMOJI", "That emoji is not on the list");
      }

      if (input.carNumber !== null) {
        player.carNumber = input.carNumber;
      }

      if (input.colour !== null) {
        player.colour = input.colour;
      }

      player.emoji = input.emoji;
      publishState(room);
    },

    startRace(code, playerId, force) {
      const room = requireRoom(code);

      requireHost(room, playerId);

      if (room.status !== "LOBBY") {
        throw new GameError(409, "INVALID_STATE", "The race has already started");
      }

      if (room.players.length < MIN_PLAYERS) {
        throw new GameError(
          409,
          "NOT_ENOUGH_PLAYERS",
          `At least ${MIN_PLAYERS} players are needed to race`,
        );
      }

      if (!force && !room.players.every((player) => player.isReady)) {
        throw new GameError(409, "PLAYERS_NOT_READY", "Every player must be ready");
      }

      for (const player of room.players) {
        resetRaceState(player);
      }

      room.status = "COUNTDOWN";
      room.raceStartsAt = new Date(now().getTime() + COUNTDOWN_MS);
      room.raceEndsAt = null;

      listener.countdown(room.code, {
        raceStartsAt: room.raceStartsAt.toISOString(),
        serverTime: now().toISOString(),
      });
      publishState(room);

      room.timers.countdown = setTimeout(() => {
        beginRace(room);
      }, COUNTDOWN_MS);
    },

    recordPosition(code, playerId, input) {
      const room = roomStore.get(code);

      if (!room || room.status !== "RACING") {
        return null;
      }

      const player = room.players.find((candidate) => candidate.playerId === playerId);

      if (!player || player.finishMs !== null) {
        return null;
      }

      // Untrusted and render-only, except as the progress source for ranking a
      // player who never crosses the line.
      player.progress = clampProgress(input.progress);
      player.lapsCompleted = Math.min(TOTAL_LAPS, Math.floor(player.progress));
      player.lastX = input.x;
      player.lastY = input.y;
      player.lastHeading = input.heading;
      room.lastActivityAt = now();

      const nowMs = room.lastActivityAt.getTime();
      const contacts = resolveContacts(player, room.players, room.contactCooldowns, nowMs);

      if (room.contactCooldowns.size > 0) {
        pruneContactCooldowns(room.contactCooldowns, nowMs);
      }

      for (const contact of contacts) {
        listener.contact(code, contact);
      }

      return {
        carNumber: player.carNumber,
        x: input.x,
        y: input.y,
        heading: input.heading,
        lap: player.lapsCompleted,
        progress: player.progress,
      };
    },

    async recordFinish(code, playerId, input) {
      const room = requireRoom(code);
      const player = requirePlayer(room, playerId);

      if (room.status !== "RACING") {
        throw new GameError(409, "INVALID_STATE", "No race is running");
      }

      if (player.finishMs !== null) {
        return;
      }

      const validated = validateFinish(input);
      const finishOrder =
        room.players.filter((candidate) => candidate.finishMs !== null).length + 1;

      player.finishMs = validated.finishMs;
      player.lapsCompleted = validated.lapsCompleted;
      player.progress = validated.progress;
      player.suspect = validated.suspect;
      player.finishOrder = finishOrder;

      listener.playerFinished(room.code, {
        carNumber: player.carNumber,
        rank: finishOrder,
        finishMs: validated.finishMs,
      });
      publishState(room);

      await maybeFinishRace(room);
    },

    rematch(code, playerId) {
      const room = requireRoom(code);

      requireHost(room, playerId);

      if (room.status !== "RESULTS") {
        throw new GameError(409, "INVALID_STATE", "A rematch can only start from the results");
      }

      clearTimers(room);
      room.status = "LOBBY";
      room.raceStartsAt = null;
      room.raceEndsAt = null;

      for (const player of room.players) {
        resetRaceState(player);
        player.isReady = false;
      }

      publishState(room);
    },

    setListener(nextListener) {
      listener = nextListener;
    },

    shutdown() {
      roomStore.stop();
      listener = noopListener;

      return Promise.resolve();
    },
  };
};
