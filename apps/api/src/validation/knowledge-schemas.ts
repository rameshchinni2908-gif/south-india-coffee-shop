import { z } from "zod";

import { KNOWLEDGE_LIMITS } from "../models/knowledge-note-model.js";

const keywordsSchema = z
  .array(z.string().trim().toLowerCase().min(1).max(KNOWLEDGE_LIMITS.keyword))
  .max(KNOWLEDGE_LIMITS.keywords)
  .transform((keywords) => [...new Set(keywords)]);

export const knowledgeNoteSlugParamsSchema = z
  .object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid note identifier") })
  .strict();

const noteFields = {
  title: z.string().trim().min(1).max(KNOWLEDGE_LIMITS.title),
  content: z.string().trim().min(20).max(KNOWLEDGE_LIMITS.content),
  keywords: keywordsSchema,
  isActive: z.boolean(),
};

export const createKnowledgeNoteBodySchema = z
  .object({
    ...noteFields,
    keywords: noteFields.keywords.default([]),
    isActive: noteFields.isActive.default(true),
  })
  .strict();

// Built from the plain fields, not the create schema: defaults there would turn a partial
// update into "clear the keywords and reactivate the note".
export const updateKnowledgeNoteBodySchema = z
  .object(noteFields)
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

export const knowledgeSearchBodySchema = z
  .object({ question: z.string().trim().min(1).max(500) })
  .strict();

export type KnowledgeNoteSlugParams = z.infer<typeof knowledgeNoteSlugParamsSchema>;
export type CreateKnowledgeNoteInput = z.infer<typeof createKnowledgeNoteBodySchema>;
export type UpdateKnowledgeNoteInput = z.infer<typeof updateKnowledgeNoteBodySchema>;
export type KnowledgeSearchInput = z.infer<typeof knowledgeSearchBodySchema>;
