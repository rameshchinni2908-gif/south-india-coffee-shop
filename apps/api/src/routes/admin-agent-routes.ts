import { Router, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";

import { createAdminAgentController } from "../controllers/admin-agent-controller.js";
import { createAuthenticateStaff } from "../middleware/authenticate-staff.js";
import { HttpError } from "../middleware/http-error.js";
import { requireRoles } from "../middleware/require-role.js";
import { validateBody } from "../middleware/validate-body.js";
import type { AdminAgentService } from "../services/admin-agent-service.js";
import type { AuthService } from "../services/auth-service.js";
import { adminBriefBodySchema } from "../validation/admin-agent-schemas.js";

export const createAdminAgentRouter = (
  authService: AuthService,
  adminAgentService: AdminAgentService,
  clientUrl: string,
): Router => {
  const router = Router();
  const controller = createAdminAgentController(adminAgentService);
  const allowedOrigin = new URL(clientUrl).origin;
  const requireTrustedOrigin: RequestHandler = (request, _response, next) => {
    const origin = request.get("Origin");
    if (origin !== undefined && origin !== allowedOrigin) {
      next(new HttpError(403, "FORBIDDEN", "This request origin is not permitted."));
      return;
    }
    next();
  };
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

  return router;
};
