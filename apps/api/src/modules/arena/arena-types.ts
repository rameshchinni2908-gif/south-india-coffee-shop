import { HttpError } from "../../middleware/http-error.js";
import type {
  ArenaErrorCode,
  ArenaStanding,
  BadgeColourId,
  PowerUpKind,
  RoomStatus,
} from "./arena-contract.js";

/**
 * An `HttpError` that also carries a typed arena error code, so the socket layer
 * can relay it as a `game:error` payload without casting a plain string.
 */
export class ArenaError extends HttpError {
  public constructor(
    statusCode: number,
    public readonly arenaCode: ArenaErrorCode,
    message: string,
  ) {
    super(statusCode, arenaCode, message);
    this.name = "ArenaError";
  }
}

/**
 * One live projectile. Beans exist only on the server: clients draw them from
 * the `arena:shot` broadcast and never decide where one lands (§7a).
 */
export interface Bean {
  id: number;
  ownerPlayerId: string;
  ownerBadgeNumber: number;
  x: number;
  y: number;
  /** World units per second, already resolved from the firing angle. */
  vx: number;
  vy: number;
  expiresAtMs: number;
}

/** One power-up pad. `kind` is null while the pad is empty and refilling. */
export interface PadState {
  kind: PowerUpKind | null;
  /** Epoch millis when an empty pad offers a new power-up. */
  availableAtMs: number;
}

/** Server-side slot for one phone. Never leaves the process as-is. */
export interface ArenaRoomPlayer {
  playerId: string;
  badgeNumber: number;
  colour: BadgeColourId;
  emoji: string | null;
  isReady: boolean;
  isConnected: boolean;
  isHost: boolean;
  joinedAt: Date;
  /**
   * Which socket currently owns this seat, or null when nothing is attached.
   *
   * Changing screens opens a new socket before the old one's disconnect has
   * necessarily reached the server, and both events name the same player.
   * Without this, a late disconnect from the abandoned socket un-seats a player
   * who is very much still here.
   */
  connectionId: string | null;
  hearts: number;
  /** Epoch millis the refill break ends, or 0 while the barista is standing. */
  downedUntilMs: number;
  /** Epoch millis the post-splash immunity ends, or 0. */
  invulnerableUntilMs: number;
  /** Server-side truth. A client's own count is never consulted. */
  ammo: number;
  /** Epoch millis a reload completes, or 0 when not reloading. */
  reloadingUntilMs: number;
  powerUp: PowerUpKind | null;
  /** Epoch millis the active power-up expires, or 0. */
  powerUpUntilMs: number;
  shieldHits: number;
  hits: number;
  taken: number;
  downs: number;
  /** The server did not believe a movement packet and clamped it. */
  suspect: boolean;
  /**
   * Authoritative pose. Clients own their own movement, but the server holds
   * the last accepted point because only it sees every barista at once — and
   * only it can therefore decide whether a bean connected.
   */
  x: number;
  y: number;
  /** Facing in radians. Independent of the direction of travel. */
  aim: number;
  /** Epoch millis of the last accepted position packet, or 0. */
  lastPositionAtMs: number;
  /** Epoch millis of the last accepted shot, or 0. */
  lastFireAtMs: number;
}

export interface ArenaRoomTimers {
  countdown: ReturnType<typeof setTimeout> | null;
  whistle: ReturnType<typeof setTimeout> | null;
  tick: ReturnType<typeof setInterval> | null;
}

/**
 * Rooms live in memory only. The API runs as a single Render instance and rooms
 * are ephemeral by design, so a redeploy losing them is acceptable (see
 * BEAN-BLASTERS.md §6). Only round results reach MongoDB.
 */
export interface ArenaRoomRecord {
  code: string;
  status: RoomStatus;
  arenaId: string;
  hostPlayerId: string;
  players: ArenaRoomPlayer[];
  beans: Bean[];
  pads: PadState[];
  /** Monotonic within a room, so a client can key a bean it is drawing. */
  nextBeanId: number;
  roundStartsAt: Date | null;
  roundEndsAt: Date | null;
  lastActivityAt: Date;
  expiresAt: Date;
  timers: ArenaRoomTimers;
  /** Epoch millis of the previous combat tick, so `dt` is measured not assumed. */
  lastTickAtMs: number;
  /** Epoch millis of the last `arena:score` broadcast. */
  lastScoreAtMs: number;
}

export interface NewArenaResultRecord {
  roomCode: string;
  arenaId: string;
  finishedAt: Date;
  standings: readonly ArenaStanding[];
  payerBadgeNumber: number;
  expiresAt: Date;
}
