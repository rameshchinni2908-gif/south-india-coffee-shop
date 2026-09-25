import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { createAdminAgentController } from "../controllers/admin-agent-controller.js";
import { createAuthenticateStaff } from "../middleware/authenticate-staff.js";
import { HttpError } from "../middleware/http-error.js";
import { requireRoles } from "../middleware/require-role.js";
import { createRequireTrustedOrigin } from "../middleware/require-trusted-origin.js";
import { validateBody } from "../middleware/validate-body.js";
import { validateParams } from "../middleware/validate-params.js";
import { validateQuery } from "../middleware/validate-query.js";
import type { AdminAgentService } from "../services/admin-agent-service.js";
import type { AuthService } from "../services/auth-service.js";
import {
  adminBriefBodySchema,
  agentRunFeedbackBodySchema,
  agentRunIdParamsSchema,
  agentRunQuerySchema,
  proposalIdParamsSchema,
} from "../validation/admin-agent-schemas.js";

export const createAdminAgentRouter = (
  authService: AuthService,
  adminAgentService: AdminAgentService,
  clientUrl: string,
): Router => {
  const router = Router();
  const controller = createAdminAgentController(adminAgentService);
  const requireTrustedOrigin = createRequireTrustedOrigin(clientUrl);
  const briefingLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    keyGenerator: (request) => request.authenticatedUser?.id ?? "unauthenticated",
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(
        new HttpError(
          429,
          "AGENT_RATE_LIMITED",
          "You can request five briefings every 15 minutes. Please try again later.",
        ),
      );
    },
  });

  router.use(createAuthenticateStaff(authService), requireRoles("ADMIN"));
  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  router.get("/status", controller.getStatus);
  router.post(
    "/brief",
    requireTrustedOrigin,
    validateBody(adminBriefBodySchema),
    briefingLimit,
    controller.createBriefing,
  );
  router.get("/runs", validateQuery(agentRunQuerySchema), controller.listRuns);
  router.patch(
    "/runs/:id/feedback",
    requireTrustedOrigin,
    validateParams(agentRunIdParamsSchema),
    validateBody(agentRunFeedbackBodySchema),
    controller.rateRun,
  );
  // Approval is the only way an assistant proposal changes shop data.
  for (const decision of ["approve", "reject"] as const) {
    router.post(
      `/proposals/:id/${decision}`,
      requireTrustedOrigin,
      validateParams(proposalIdParamsSchema),
      decision === "approve" ? controller.approveProposal : controller.rejectProposal,
    );
  }

  return router;
};
