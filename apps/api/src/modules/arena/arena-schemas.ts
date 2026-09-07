import { z } from "zod";

import {
  MAX_BADGE_NUMBER,
  MIN_BADGE_NUMBER,
  PLAYER_ID_PATTERN,
  ROOM_CODE_PATTERN,
} from "./arena-contract.js";

const playerIdSchema = z.string().regex(PLAYER_ID_PATTERN, "Invalid player identifier");
const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(ROOM_CODE_PATTERN, "Invalid room code");
const arenaIdSchema = z.string().trim().min(1).max(40);
const badgeNumberSchema = z.number().int().min(MIN_BADGE_NUMBER).max(MAX_BADGE_NUMBER);
/** Fixed allow-list ids only; players never type free text in this game. */
const colourIdSchema = z.string().trim().min(1).max(20);
const emojiSchema = z.string().min(1).max(8);
const worldCoordinateSchema = z.number().finite();

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

export const createRoomBodySchema = z.object({ arenaId: arenaIdSchema.optional() }).strict();

export const joinRoomBodySchema = z.object({ playerId: playerIdSchema.optional() }).strict();

export const roomCodeParamsSchema = z.object({ code: roomCodeSchema }).strict();

// ---------------------------------------------------------------------------
// Socket payloads (every one of these arrives from an untrusted phone)
// ---------------------------------------------------------------------------

export const helloPayloadSchema = z
  .object({ code: roomCodeSchema, playerId: playerIdSchema })
  .strict();

export const setReadyPayloadSchema = z.object({ isReady: z.boolean() }).strict();

export const setBadgePayloadSchema = z
  .object({
    badgeNumber: badgeNumberSchema.nullable(),
    colour: colourIdSchema.nullable(),
    emoji: emojiSchema.nullable(),
  })
  .strict();

export const startRoundPayloadSchema = z.object({ force: z.boolean() }).strict();

export const positionPayloadSchema = z
  .object({
    x: worldCoordinateSchema,
    y: worldCoordinateSchema,
    aim: worldCoordinateSchema,
  })
  .strict();

/**
 * A request to throw, never a report of a hit. The server re-checks cadence,
 * ammo and origin drift before a bean exists (BEAN-BLASTERS.md §7a).
 */
export const firePayloadSchema = z
  .object({
    x: worldCoordinateSchema,
    y: worldCoordinateSchema,
    angle: worldCoordinateSchema,
  })
  .strict();

export type CreateArenaRoomInput = z.infer<typeof createRoomBodySchema>;
export type JoinArenaRoomInput = z.infer<typeof joinRoomBodySchema>;
export type ArenaRoomCodeParams = z.infer<typeof roomCodeParamsSchema>;
export type HelloPayload = z.infer<typeof helloPayloadSchema>;
export type SetReadyPayload = z.infer<typeof setReadyPayloadSchema>;
export type SetBadgePayload = z.infer<typeof setBadgePayloadSchema>;
export type StartRoundPayload = z.infer<typeof startRoundPayloadSchema>;
export type PositionPayload = z.infer<typeof positionPayloadSchema>;
export type FirePayload = z.infer<typeof firePayloadSchema>;
