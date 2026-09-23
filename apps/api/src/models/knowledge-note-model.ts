import { Schema, model } from "mongoose";

export const KNOWLEDGE_VECTOR_INDEX = "knowledge_note_embedding";
export const KNOWLEDGE_LIMITS = {
  title: 120,
  // One note is one retrieval chunk, so notes stay short enough to embed as a whole.
  content: 2_000,
  keywords: 20,
  keyword: 40,
} as const;

const knowledgeNoteSchema = new Schema(
  {
    // Stable identifier used in run logs and evals; never changes after creation.
    slug: { type: String, required: true, unique: true, immutable: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: KNOWLEDGE_LIMITS.title },
    content: { type: String, required: true, trim: true, maxlength: KNOWLEDGE_LIMITS.content },
    keywords: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    // Excluded from queries by default: a vector is large and only retrieval needs it.
    embedding: { type: [Number], default: undefined, select: false },
    // Hash of the text, model and dimensions the embedding was created from.
    embeddingHash: { type: String, default: null },
    embeddedAt: { type: Date, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

export const KnowledgeNoteModel = model("KnowledgeNote", knowledgeNoteSchema);
