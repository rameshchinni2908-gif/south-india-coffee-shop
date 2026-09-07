import { z } from "zod";

import {
  MAX_CAR_NUMBER,
  MIN_CAR_NUMBER,
  PLAYER_ID_PATTERN,
  ROOM_CODE_PATTERN,
  TOTAL_LAPS,
} from "./game-contract.js";

const playerIdSchema = z.string().regex(PLAYER_ID_PATTERN, "Invalid player identifier");
const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(ROOM_CODE_PATTERN, "Invalid room code");
const trackIdSchema = z.string().trim().min(1).max(40);
const carNumberSchema = z.number().int().min(MIN_CAR_NUMBER).max(MAX_CAR_NUMBER);
/** Fixed allow-list ids only; players never type free text in this game. */
const colourIdSchema = z.string().trim().min(1).max(20);
const emojiSchema = z.string().min(1).max(8);
const worldCoordinateSchema = z.number().finite();

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

export const createRoomBodySchema = z.object({ trackId: trackIdSchema.optional() }).strict();

export const joinRoomBodySchema = z.object({ playerId: playerIdSchema.optional() }).strict();

export const roomCodeParamsSchema = z.object({ code: roomCodeSchema }).strict();

// ---------------------------------------------------------------------------
// Socket payloads (every one of these arrives from an untrusted phone)
// ---------------------------------------------------------------------------

export const helloPayloadSchema = z
  .object({ code: roomCodeSchema, playerId: playerIdSchema })
  .strict();

export const setReadyPayloadSchema = z.object({ isReady: z.boolean() }).strict();

export const setCarPayloadSchema = z
  .object({
    carNumber: carNumberSchema.nullable(),
    colour: colourIdSchema.nullable(),
    emoji: emojiSchema.nullable(),
  })
  .strict();

export const startRacePayloadSchema = z.object({ force: z.boolean() }).strict();

export const positionPayloadSchema = z
  .object({
    x: worldCoordinateSchema,
    y: worldCoordinateSchema,
    heading: worldCoordinateSchema,
    lap: z.number().int().min(0).max(TOTAL_LAPS),
    progress: z.number().min(0).max(TOTAL_LAPS),
  })
  .strict();

export const finishPayloadSchema = z
  .object({
    finishMs: z.number().finite().min(0),
    lapSplits: z.array(z.number().finite().min(0)).max(16),
  })
  .strict();

export type CreateRoomInput = z.infer<typeof createRoomBodySchema>;
export type JoinRoomInput = z.infer<typeof joinRoomBodySchema>;
export type RoomCodeParams = z.infer<typeof roomCodeParamsSchema>;
export type HelloPayload = z.infer<typeof helloPayloadSchema>;
export type SetReadyPayload = z.infer<typeof setReadyPayloadSchema>;
export type SetCarPayload = z.infer<typeof setCarPayloadSchema>;
export type StartRacePayload = z.infer<typeof startRacePayloadSchema>;
export type PositionPayload = z.infer<typeof positionPayloadSchema>;
export type FinishPayload = z.infer<typeof finishPayloadSchema>;
