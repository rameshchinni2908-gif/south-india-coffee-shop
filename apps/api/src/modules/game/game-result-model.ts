import { Schema, model } from "mongoose";

import { MAX_CAR_NUMBER, MIN_CAR_NUMBER, ROOM_CODE_LENGTH, TOTAL_LAPS } from "./game-contract.js";

const standingSchema = new Schema(
  {
    carNumber: {
      type: Number,
      required: true,
      min: MIN_CAR_NUMBER,
      max: MAX_CAR_NUMBER,
      validate: Number.isInteger,
    },
    colour: { type: String, required: true, trim: true, maxlength: 20 },
    emoji: { type: String, required: false, default: null, maxlength: 8 },
    rank: { type: Number, required: true, min: 1, validate: Number.isInteger },
    finishMs: { type: Number, required: false, default: null, min: 0 },
    lapsCompleted: {
      type: Number,
      required: true,
      min: 0,
      max: TOTAL_LAPS,
      validate: Number.isInteger,
    },
    progress: { type: Number, required: true, min: 0, max: TOTAL_LAPS },
    disconnected: { type: Boolean, required: true, default: false },
    suspect: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

/**
 * The only game data that reaches MongoDB. It carries no PII and no reference to
 * any shop document, and self-deletes through the TTL index below.
 */
const gameResultSchema = new Schema(
  {
    roomCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: ROOM_CODE_LENGTH,
    },
    trackId: { type: String, required: true, trim: true, maxlength: 40 },
    finishedAt: { type: Date, required: true },
    standings: {
      type: [standingSchema],
      required: true,
      validate: {
        validator: (standings: unknown[]) => standings.length > 0,
        message: "At least one standing is required",
      },
    },
    payerCarNumber: {
      type: Number,
      required: true,
      min: MIN_CAR_NUMBER,
      max: MAX_CAR_NUMBER,
      validate: Number.isInteger,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "gameresults" },
);

gameResultSchema.index({ roomCode: 1, finishedAt: -1 });
gameResultSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const GameResultModel = model("GameResult", gameResultSchema);
