import { HttpError } from "../../middleware/http-error.js";
import type { CarColourId, GameErrorCode, RaceStanding, RoomStatus } from "./game-contract.js";

/**
 * An `HttpError` that also carries a typed game error code, so the socket layer
 * can relay it as a `game:error` payload without casting a plain string.
 */
export class GameError extends HttpError {
  public constructor(
    statusCode: number,
    public readonly gameCode: GameErrorCode,
    message: string,
  ) {
    super(statusCode, gameCode, message);
    this.name = "GameError";
  }
}

/** Server-side slot for one phone. Never leaves the process as-is. */
export interface RoomPlayer {
  playerId: string;
  carNumber: number;
  colour: CarColourId;
  emoji: string | null;
  isReady: boolean;
  isConnected: boolean;
  isHost: boolean;
  joinedAt: Date;
  /** Milliseconds from lights-out, or null while still driving. */
  finishMs: number | null;
  /** Fractional laps travelled, from the last accepted position broadcast. */
  progress: number;
  lapsCompleted: number;
  /** The submitted time was implausible and was clamped to the cap. */
  suspect: boolean;
  /** Order of arrival at the flag, 1-based; null until the player finishes. */
  finishOrder: number | null;
}

export interface RoomTimers {
  countdown: ReturnType<typeof setTimeout> | null;
  cap: ReturnType<typeof setTimeout> | null;
}

/**
 * Rooms live in memory only. The API runs as a single Render instance and rooms
 * are ephemeral by design, so a redeploy losing them is acceptable (see
 * KAAPI-KARTS.md §16). Only race results reach MongoDB.
 */
export interface RoomRecord {
  code: string;
  status: RoomStatus;
  trackId: string;
  hostPlayerId: string;
  players: RoomPlayer[];
  raceStartsAt: Date | null;
  raceEndsAt: Date | null;
  lastActivityAt: Date;
  expiresAt: Date;
  timers: RoomTimers;
}

export interface NewGameResultRecord {
  roomCode: string;
  trackId: string;
  finishedAt: Date;
  standings: readonly RaceStanding[];
  payerCarNumber: number;
  expiresAt: Date;
}
