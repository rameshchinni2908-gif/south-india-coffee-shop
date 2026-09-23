import { Schema, model } from "mongoose";

import { AGENT_RUN_OUTCOMES, AGENT_RUN_RATINGS } from "../types/agent-run.js";

// Runs contain admin questions and shop figures, so they expire instead of growing forever.
export const AGENT_RUN_RETENTION_DAYS = 90;

const durationMs = { type: Number, required: true, min: 0 };
const tokenCount = { type: Number, default: null, min: 0 };

const agentRunSchema = new Schema(
  {
    adminId: { type: String, required: true, index: true },
    question: { type: String, required: true, maxlength: 500 },
    outcome: { type: String, enum: AGENT_RUN_OUTCOMES, required: true },
    answer: { type: String, default: null, maxlength: 4_000 },
    failureReason: { type: String, default: null, maxlength: 300 },
    sourceIds: { type: [String], default: [] },
    model: { type: String, default: null },
    totalDurationMs: durationMs,
    inputTokens: { type: Number, required: true, min: 0 },
    outputTokens: { type: Number, required: true, min: 0 },
    trace: {
      retrieval: {
        type: new Schema(
          {
            mode: { type: String, enum: ["hybrid", "keyword"], required: true },
            durationMs,
            embeddingTokens: { type: Number, required: true, min: 0 },
            fallbackReason: { type: String, default: null },
          },
          { _id: false },
        ),
        default: null,
      },
      retrievedKnowledge: [
        {
          _id: false,
          id: String,
          fusedScore: Number,
          keywordScore: { type: Number, default: null },
          similarity: { type: Number, default: null },
          // Runs saved before hybrid retrieval stored only the keyword score here.
          score: Number,
        },
      ],
      modelCalls: [
        {
          _id: false,
          durationMs,
          ok: { type: Boolean, required: true },
          inputTokens: tokenCount,
          outputTokens: tokenCount,
          requestedTools: { type: [String], default: [] },
        },
      ],
      toolCalls: [
        {
          _id: false,
          name: { type: String, required: true },
          durationMs,
          ok: { type: Boolean, required: true },
        },
      ],
    },
    feedback: {
      type: new Schema(
        {
          rating: { type: String, enum: AGENT_RUN_RATINGS, required: true },
          comment: { type: String, default: null, maxlength: 500 },
          ratedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    createdAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

// One TTL index serves both expiry and newest-first listing.
agentRunSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: AGENT_RUN_RETENTION_DAYS * 24 * 60 * 60 },
);

export const AgentRunModel = model("AgentRun", agentRunSchema);
