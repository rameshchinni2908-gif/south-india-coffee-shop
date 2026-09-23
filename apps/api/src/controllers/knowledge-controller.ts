import type { Request, RequestHandler } from "express";

import { asyncHandler } from "../middleware/async-handler.js";
import { HttpError } from "../middleware/http-error.js";
import type { KnowledgeService } from "../services/knowledge-service.js";
import type {
  CreateKnowledgeNoteInput,
  KnowledgeNoteSlugParams,
  KnowledgeSearchInput,
  UpdateKnowledgeNoteInput,
} from "../validation/knowledge-schemas.js";

const requireAdminId = (request: Request): string => {
  const adminId = request.authenticatedUser?.id;
  if (!adminId) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return adminId;
};
const ok = <T>(data: T) => ({ success: true, data, meta: {}, error: null });

export const createKnowledgeController = (
  knowledgeService: KnowledgeService,
): Record<"list" | "create" | "update" | "embedPending" | "search", RequestHandler> => ({
  list: asyncHandler(async (_request, response) => {
    const notes = await knowledgeService.listNotes();
    response.status(200).json(ok({ notes, retrieval: knowledgeService.getStatus() }));
  }),
  create: asyncHandler(async (request, response) => {
    const note = await knowledgeService.createNote(
      request.body as CreateKnowledgeNoteInput,
      requireAdminId(request),
    );
    response.status(201).json(ok({ note }));
  }),
  update: asyncHandler(async (request, response) => {
    const { slug } = request.validatedParams as KnowledgeNoteSlugParams;
    const note = await knowledgeService.updateNote(
      slug,
      request.body as UpdateKnowledgeNoteInput,
      requireAdminId(request),
    );
    response.status(200).json(ok({ note }));
  }),
  embedPending: asyncHandler(async (_request, response) => {
    response.status(200).json(ok(await knowledgeService.embedPending()));
  }),
  search: asyncHandler(async (request, response) => {
    const { question } = request.body as KnowledgeSearchInput;
    const result = await knowledgeService.retrieve(question);
    // Explains the ranking without sending the notes' full text back.
    response.status(200).json(
      ok({
        search: {
          mode: result.mode,
          fallbackReason: result.fallbackReason,
          embeddingTokens: result.embeddingTokens,
          results: result.documents.map(({ document, fusedScore, keyword, vector }) => ({
            slug: document.id,
            title: document.title,
            fusedScore,
            keyword,
            vector,
          })),
        },
      }),
    );
  }),
});
