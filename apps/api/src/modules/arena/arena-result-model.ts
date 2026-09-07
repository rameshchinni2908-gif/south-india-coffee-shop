import { Schema, model } from "mongoose";

import { MAX_BADGE_NUMBER, MIN_BADGE_NUMBER, ROOM_CODE_LENGTH } from "./arena-contract.js";

const standingSchema = new Schema(
  {
    badgeNumber: {
      type: Number,
      required: true,
      min: MIN_BADGE_NUMBER,
      max: MAX_BADGE_NUMBER,
      validate: Number.isInteger,
    },
    colour: { type: String, required: true, trim: true, maxlength: 20 },
    emoji: { type: String, required: false, default: null, maxlength: 8 },
    rank: { type: Number, required: true, min: 1, validate: Number.isInteger },
    hits: { type: Number, required: true, min: 0, validate: Number.isInteger },
    taken: { type: Number, required: true, min: 0, validate: Number.isInteger },
    downs: { type: Number, required: true, min: 0, validate: Number.isInteger },
    disconnected: { type: Boolean, required: true, default: false },
    suspect: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

/**
 * The only Bean Blasters data that reaches MongoDB. It carries no PII and no
 * reference to any shop document, and self-deletes through the TTL index below.
 */
const arenaResultSchema = new Schema(
  {
    roomCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: ROOM_CODE_LENGTH,
    },
    arenaId: { type: String, required: true, trim: true, maxlength: 40 },
    finishedAt: { type: Date, required: true },
    standings: {
      type: [standingSchema],
      required: true,
      validate: {
        validator: (standings: unknown[]) => standings.length > 0,
        message: "At least one standing is required",
      },
    },
    payerBadgeNumber: {
      type: Number,
      required: true,
      min: MIN_BADGE_NUMBER,
      max: MAX_BADGE_NUMBER,
      validate: Number.isInteger,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "arenaresults" },
);

arenaResultSchema.index({ roomCode: 1, finishedAt: -1 });
arenaResultSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ArenaResultModel = model("ArenaResult", arenaResultSchema);
