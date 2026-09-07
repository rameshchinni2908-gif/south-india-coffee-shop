import { ApiClientError, apiGet, apiPost } from "../../lib/api-client.js";
import type { GameErrorCode, GameRoomState, RaceResult } from "./game-contract.js";

const GAME_BASE_PATH = "/api/game";

export interface CreatedRoom {
  readonly code: string;
  readonly playerId: string;
  readonly hostPlayerId: string;
}

export interface JoinedRoom {
  readonly playerId: string;
  readonly carNumber: number | null;
  readonly colour: string | null;
  readonly room: GameRoomState | null;
}

interface CreateRoomPayload {
  code: string;
  playerId: string;
  hostPlayerId?: string;
}

interface RoomEnvelope {
  room?: GameRoomState;
  state?: GameRoomState;
}

interface JoinRoomPayload extends RoomEnvelope {
  playerId: string;
  carNumber?: number;
  colour?: string;
}

interface ResultEnvelope {
  result?: RaceResult;
  results?: RaceResult;
}

const readRoom = (payload: RoomEnvelope): GameRoomState => {
  const room = payload.room ?? payload.state;

  if (!room) {
    throw new ApiClientError(404, "ROOM_NOT_FOUND", "This race room has closed.");
  }

  return room;
};

export const pingGameHealth = async (signal?: AbortSignal): Promise<boolean> => {
  const response = await apiGet<{ enabled?: boolean }>(`${GAME_BASE_PATH}/health`, signal);

  return response.data.enabled !== false;
};

export const createRoom = async (trackId?: string, signal?: AbortSignal): Promise<CreatedRoom> => {
  const body = trackId ? { trackId } : {};
  const response = await apiPost<CreateRoomPayload, typeof body>(
    `${GAME_BASE_PATH}/rooms`,
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
): Promise<JoinedRoom> => {
  const body = playerId ? { playerId } : {};
  const response = await apiPost<JoinRoomPayload, typeof body>(
    `${GAME_BASE_PATH}/rooms/${encodeURIComponent(code)}/join`,
    body,
    signal,
  );
  const payload = response.data;

  return {
    playerId: payload.playerId,
    carNumber: payload.carNumber ?? null,
    colour: payload.colour ?? null,
    room: payload.room ?? payload.state ?? null,
  };
};

export const getRoom = async (code: string, signal?: AbortSignal): Promise<GameRoomState> => {
  const response = await apiGet<RoomEnvelope>(
    `${GAME_BASE_PATH}/rooms/${encodeURIComponent(code)}`,
    signal,
  );

  return readRoom(response.data);
};

export const getRaceResult = async (code: string, signal?: AbortSignal): Promise<RaceResult> => {
  const response = await apiGet<ResultEnvelope>(
    `${GAME_BASE_PATH}/results/${encodeURIComponent(code)}`,
    signal,
  );
  const result = response.data.result ?? response.data.results;

  if (!result) {
    throw new ApiClientError(404, "ROOM_NOT_FOUND", "No finished race was found for this room.");
  }

  return result;
};

const GAME_ERROR_MESSAGES: Record<GameErrorCode, string> = {
  GAME_DISABLED: "Kaapi Karts is switched off right now. Ask the counter to turn it back on.",
  ROOM_NOT_FOUND: "No race room with that code. Check the four characters and try again.",
  ROOM_FULL: "That race room is full — it already has six karts on the grid.",
  ROOM_IN_PROGRESS: "That race has already started. Wait for the next one and join then.",
  ROOM_CLOSED: "This race room has closed.",
  NUMBER_TAKEN: "Another kart already carries that number. Pick a different one.",
  INVALID_NUMBER: "Car numbers run from 1 to 99.",
  COLOUR_TAKEN: "That colour is taken. Pick another from the palette.",
  INVALID_COLOUR: "That colour is not part of the Kaapi Karts palette.",
  INVALID_EMOJI: "That emoji is not on the list. Pick one from the tray.",
  NOT_HOST: "Only the player who created the room can do that.",
  NOT_IN_ROOM: "You are not in this race room any more.",
  NOT_ENOUGH_PLAYERS: "You need at least two karts on the grid to start.",
  PLAYERS_NOT_READY: "Everyone has to be ready — or use Force start.",
  INVALID_STATE: "That is not possible at this point in the race.",
  INVALID_TRACK: "That track is not available.",
  TOO_MANY_ROOMS: "Too many rooms created from this connection. Try again in a little while.",
};

const isGameErrorCode = (code: string): code is GameErrorCode =>
  Object.prototype.hasOwnProperty.call(GAME_ERROR_MESSAGES, code);

/** Turns any thrown value into one safe, player-facing sentence. */
export const describeGameError = (error: unknown, fallback: string): string => {
  if (error instanceof ApiClientError) {
    return isGameErrorCode(error.code) ? GAME_ERROR_MESSAGES[error.code] : error.message;
  }

  return fallback;
};

export const describeGameErrorCode = (code: GameErrorCode): string => GAME_ERROR_MESSAGES[code];
