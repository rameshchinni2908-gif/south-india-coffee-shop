import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { createKnowledgeController } from "../controllers/knowledge-controller.js";
import { createAuthenticateStaff } from "../middleware/authenticate-staff.js";
import { HttpError } from "../middleware/http-error.js";
import { requireRoles } from "../middleware/require-role.js";
import { createRequireTrustedOrigin } from "../middleware/require-trusted-origin.js";
import { validateBody } from "../middleware/validate-body.js";
import { validateParams } from "../middleware/validate-params.js";
import type { AuthService } from "../services/auth-service.js";
import type { KnowledgeService } from "../services/knowledge-service.js";
import {
  createKnowledgeNoteBodySchema,
  knowledgeNoteSlugParamsSchema,
  knowledgeSearchBodySchema,
  updateKnowledgeNoteBodySchema,
} from "../validation/knowledge-schemas.js";

export const createAdminKnowledgeRouter = (
  authService: AuthService,
  knowledgeService: KnowledgeService,
  clientUrl: string,
): Router => {
  const router = Router();
  const controller = createKnowledgeController(knowledgeService);
  const requireTrustedOrigin = createRequireTrustedOrigin(clientUrl);
  // Saves, searches and re-embedding call the paid embeddings API.
  const embeddingLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    keyGenerator: (request) => request.authenticatedUser?.id ?? "unauthenticated",
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(new HttpError(429, "KNOWLEDGE_RATE_LIMITED", "Too many knowledge requests. Try later."));
    },
  });

  // The knowledge base steers the admin assistant, so only administrators may change it.
  router.use(createAuthenticateStaff(authService), requireRoles("ADMIN"));
  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  router.get("/", controller.list);
  router.post(
    "/",
    requireTrustedOrigin,
    validateBody(createKnowledgeNoteBodySchema),
    embeddingLimit,
    controller.create,
  );
  router.patch(
    "/:slug",
    requireTrustedOrigin,
    validateParams(knowledgeNoteSlugParamsSchema),
    validateBody(updateKnowledgeNoteBodySchema),
    embeddingLimit,
    controller.update,
  );
  router.post("/embed", requireTrustedOrigin, embeddingLimit, controller.embedPending);
  router.post(
    "/search",
    requireTrustedOrigin,
    validateBody(knowledgeSearchBodySchema),
    embeddingLimit,
    controller.search,
  );

  return router;
};
