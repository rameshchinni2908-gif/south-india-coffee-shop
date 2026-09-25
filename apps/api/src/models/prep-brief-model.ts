import { Schema, model } from "mongoose";

// One brief per shop day, kept for a while so staff can look back.
export const PREP_BRIEF_RETENTION_DAYS = 60;

const prepBriefSchema = new Schema(
  {
    date: { type: String, required: true, unique: true }, // YYYY-MM-DD, shop timezone
    // The computed plan; the source of truth shown to staff.
    forecast: { type: Schema.Types.Mixed, required: true },
    // Optional plain-language summary written by the model from the forecast only.
    narrative: { type: String, default: null, maxlength: 2_000 },
    narrativeStatus: {
      type: String,
      enum: ["WRITTEN", "SKIPPED", "REJECTED", "FAILED"],
      required: true,
    },
    model: { type: String, default: null },
    generatedAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

prepBriefSchema.index(
  { generatedAt: 1 },
  { expireAfterSeconds: PREP_BRIEF_RETENTION_DAYS * 24 * 60 * 60 },
);

export const PrepBriefModel = model("PrepBrief", prepBriefSchema);
