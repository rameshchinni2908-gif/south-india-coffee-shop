import { randomBytes } from "node:crypto";

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./game-contract.js";
import type { RoomRecord } from "./game-types.js";

const MINUTE_MS = 60_000;
const DEFAULT_SWEEP_INTERVAL_MS = 60_000;
/** Guards against a pathological run of collisions on a nearly full keyspace. */
const MAX_CODE_ATTEMPTS = 50;

export interface RoomStoreOptions {
  ttlMinutes: number;
  now?: () => Date;
  sweepIntervalMs?: number;
}

export interface RoomStore {
  generateCode(): string;
  set(room: RoomRecord): void;
  get(code: string): RoomRecord | undefined;
  delete(code: string): void;
  /** Refresh the idle TTL after any meaningful change. */
  touch(room: RoomRecord): void;
  /** Drop every expired room and return the codes that were evicted. */
  sweep(): string[];
  size(): number;
  stop(): void;
}

/** 32-character opaque identity. The only credential a player ever holds. */
export const createPlayerId = (): string => randomBytes(16).toString("hex");

export const createRoomCode = (): string => {
  const bytes = randomBytes(ROOM_CODE_LENGTH);
  let code = "";

  for (const byte of bytes) {
    code += ROOM_CODE_ALPHABET.charAt(byte % ROOM_CODE_ALPHABET.length);
  }

  return code;
};

const clearRoomTimers = (room: RoomRecord): void => {
  if (room.timers.countdown) {
    clearTimeout(room.timers.countdown);
    room.timers.countdown = null;
  }

  if (room.timers.cap) {
    clearTimeout(room.timers.cap);
    room.timers.cap = null;
  }
};

export const createRoomStore = ({
  ttlMinutes,
  now = () => new Date(),
  sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS,
}: RoomStoreOptions): RoomStore => {
  const rooms = new Map<string, RoomRecord>();

  const store: RoomStore = {
    generateCode() {
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        const code = createRoomCode();

        if (!rooms.has(code)) {
          return code;
        }
      }

      throw new Error("Unable to allocate a free room code");
    },

    set(room) {
      rooms.set(room.code, room);
    },

    get(code) {
      return rooms.get(code);
    },

    delete(code) {
      const room = rooms.get(code);

      if (room) {
        clearRoomTimers(room);
        rooms.delete(code);
      }
    },

    touch(room) {
      const timestamp = now();

      room.lastActivityAt = timestamp;
      room.expiresAt = new Date(timestamp.getTime() + ttlMinutes * MINUTE_MS);
    },

    sweep() {
      const currentTime = now().getTime();
      const evicted: string[] = [];

      for (const [code, room] of rooms) {
        if (room.expiresAt.getTime() <= currentTime) {
          clearRoomTimers(room);
          rooms.delete(code);
          evicted.push(code);
        }
      }

      return evicted;
    },

    size() {
      return rooms.size;
    },

    stop() {
      clearInterval(sweeper);

      for (const room of rooms.values()) {
        clearRoomTimers(room);
      }

      rooms.clear();
    },
  };

  const sweeper = setInterval(() => {
    store.sweep();
  }, sweepIntervalMs);

  sweeper.unref?.();

  return store;
};
