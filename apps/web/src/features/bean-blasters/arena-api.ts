import { ApiClientError, apiGet, apiPost } from "../../lib/api-client.js";
import type { ArenaErrorCode, ArenaResult, ArenaRoomState } from "./arena-contract.js";

const ARENA_BASE_PATH = "/api/arena";

export interface CreatedArenaRoom {
  readonly code: string;
  readonly playerId: string;
  readonly hostPlayerId: string;
}

export interface JoinedArenaRoom {
  readonly playerId: string;
  readonly badgeNumber: number | null;
  readonly colour: string | null;
  readonly room: ArenaRoomState | null;
}

interface CreateRoomPayload {
  code: string;
  playerId: string;
  hostPlayerId?: string;
}

interface RoomEnvelope {
  room?: ArenaRoomState;
  state?: ArenaRoomState;
}

interface JoinRoomPayload extends RoomEnvelope {
  playerId: string;
  badgeNumber?: number;
  colour?: string;
}

interface ResultEnvelope {
  result?: ArenaResult;
  results?: ArenaResult;
}

const readRoom = (payload: RoomEnvelope): ArenaRoomState => {
  const room = payload.room ?? payload.state;

  if (!room) {
    throw new ApiClientError(404, "ROOM_NOT_FOUND", "This arena room has closed.");
  }

  return room;
};

/** Wake-ping for the sleeping free-tier API, fired from the start screen. */
export const pingArenaHealth = async (signal?: AbortSignal): Promise<boolean> => {
  const response = await apiGet<{ enabled?: boolean }>(`${ARENA_BASE_PATH}/health`, signal);

  return response.data.enabled !== false;
};

export const createRoom = async (
  arenaId?: string,
  signal?: AbortSignal,
): Promise<CreatedArenaRoom> => {
  const body = arenaId ? { arenaId } : {};
  const response = await apiPost<CreateRoomPayload, typeof body>(
    `${ARENA_BASE_PATH}/rooms`,
    body,
    signal,
  );
  const { code, playerId, hostPlayerId } = response.data;

  return { code, playerId, hostPlayerId: hostPlayerId ?? playerId };
};

export const joinRoom = async (
  code: string,
  playerId?: string | null,
  signal?: AbortSignal,
): Promise<JoinedArenaRoom> => {
  const body = playerId ? { playerId } : {};
  const response = await apiPost<JoinRoomPayload, typeof body>(
    `${ARENA_BASE_PATH}/rooms/${encodeURIComponent(code)}/join`,
    body,
    signal,
  );
  const payload = response.data;

  return {
    playerId: payload.playerId,
    badgeNumber: payload.badgeNumber ?? null,
    colour: payload.colour ?? null,
    room: payload.room ?? payload.state ?? null,
  };
};

export const getRoom = async (code: string, signal?: AbortSignal): Promise<ArenaRoomState> => {
  const response = await apiGet<RoomEnvelope>(
    `${ARENA_BASE_PATH}/rooms/${encodeURIComponent(code)}`,
    signal,
  );

  return readRoom(response.data);
};

export const getArenaResult = async (code: string, signal?: AbortSignal): Promise<ArenaResult> => {
  const response = await apiGet<ResultEnvelope>(
    `${ARENA_BASE_PATH}/results/${encodeURIComponent(code)}`,
    signal,
  );
  const result = response.data.result ?? response.data.results;

  if (!result) {
    throw new ApiClientError(404, "ROOM_NOT_FOUND", "No finished round was found for this room.");
  }

  return result;
};

const ARENA_ERROR_MESSAGES: Record<ArenaErrorCode, string> = {
  GAME_DISABLED: "Bean Blasters is switched off right now. Ask the counter to turn it back on.",
  ROOM_NOT_FOUND: "No arena room with that code. Check the four characters and try again.",
  ROOM_FULL: "That arena is full — it already has six baristas on the floor.",
  ROOM_IN_PROGRESS: "That round has already started. Wait for the next one and join then.",
  ROOM_CLOSED: "This arena room has closed.",
  NUMBER_TAKEN: "Another barista already wears that badge. Pick a different number.",
  INVALID_NUMBER: "Badge numbers run from 1 to 99.",
  COLOUR_TAKEN: "That colour is taken. Pick another from the palette.",
  INVALID_COLOUR: "That colour is not part of the Bean Blasters palette.",
  INVALID_EMOJI: "That emoji is not on the list. Pick one from the tray.",
  NOT_HOST: "Only the player who created the room can do that.",
  NOT_IN_ROOM: "You are not in this arena room any more.",
  NOT_ENOUGH_PLAYERS: "You need at least one barista on the floor to start.",
  PLAYERS_NOT_READY: "Everyone has to be ready — or use Force start.",
  INVALID_STATE: "That is not possible at this point in the round.",
  INVALID_ARENA: "That arena is not available.",
  TOO_MANY_ROOMS: "Too many rooms created from this connection. Try again in a little while.",
};

const isArenaErrorCode = (code: string): code is ArenaErrorCode =>
  Object.prototype.hasOwnProperty.call(ARENA_ERROR_MESSAGES, code);

/** Turns any thrown value into one safe, player-facing sentence. */
export const describeArenaError = (error: unknown, fallback: string): string => {
  if (error instanceof ApiClientError) {
    return isArenaErrorCode(error.code) ? ARENA_ERROR_MESSAGES[error.code] : error.message;
  }

  return fallback;
};

export const describeArenaErrorCode = (code: ArenaErrorCode): string => ARENA_ERROR_MESSAGES[code];
