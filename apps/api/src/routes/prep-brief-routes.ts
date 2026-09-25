import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";

import { asyncHandler } from "../middleware/async-handler.js";
import { createAuthenticateStaff } from "../middleware/authenticate-staff.js";
import { hasBearerToken } from "../middleware/bearer-token.js";
import { HttpError } from "../middleware/http-error.js";
import { requireRoles } from "../middleware/require-role.js";
import { createRequireTrustedOrigin } from "../middleware/require-trusted-origin.js";
import type { PrepBriefRecord } from "../repositories/prep-brief-repository.js";
import type { AuthService } from "../services/auth-service.js";
import type { PrepBriefService } from "../services/prep-brief-service.js";

const send = (response: Response, brief: PrepBriefRecord): void => {
  response.status(200).json({
    success: true,
    data: { brief: { ...brief, generatedAt: brief.generatedAt.toISOString() } },
    meta: {},
    error: null,
  });
};

// Staff and admins read the plan; only admins can pay for a fresh narrative.
export const createAdminPrepBriefRouter = (
  authService: AuthService,
  prepBriefService: PrepBriefService,
  clientUrl: string,
): Router => {
  const router = Router();
  const regenerateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    keyGenerator: (request) => request.authenticatedUser?.id ?? "unauthenticated",
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(new HttpError(429, "PREP_BRIEF_RATE_LIMITED", "Try regenerating again later."));
    },
  });

  router.use(createAuthenticateStaff(authService));
  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  router.get(
    "/today",
    asyncHandler(async (_request, response) => send(response, await prepBriefService.getToday())),
  );
  router.post(
    "/today/regenerate",
    requireRoles("ADMIN"),
    createRequireTrustedOrigin(clientUrl),
    regenerateLimit,
    asyncHandler(async (_request, response) =>
      send(response, await prepBriefService.regenerateToday()),
    ),
  );
  return router;
};

// For a scheduler (GitHub Actions) to prepare the brief before opening time.
export const createPrepBriefCronRouter = (
  prepBriefService: PrepBriefService,
  token: string,
): Router => {
  const router = Router();
  router.post(
    "/",
    asyncHandler(async (request, response) => {
      if (!hasBearerToken(request, token)) {
        throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
      }
      // Idempotent: an existing brief for today is returned rather than regenerated.
      const brief = await prepBriefService.getToday();
      response.status(200).json({
        success: true,
        data: { date: brief.date, items: brief.forecast.items.length },
        meta: {},
        error: null,
      });
    }),
  );
  return router;
};
