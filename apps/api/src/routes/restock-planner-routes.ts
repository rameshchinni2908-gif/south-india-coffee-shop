import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import { planDecisionSchema } from "../langgraph/restock-planner-graph.js";
import type {
  RestockPlannerService,
  RestockPlanView,
} from "../langgraph/restock-planner-service.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { createAuthenticateStaff } from "../middleware/authenticate-staff.js";
import { HttpError } from "../middleware/http-error.js";
import { requireRoles } from "../middleware/require-role.js";
import { createRequireTrustedOrigin } from "../middleware/require-trusted-origin.js";
import { validateBody } from "../middleware/validate-body.js";
import { validateParams } from "../middleware/validate-params.js";
import type { AuthService } from "../services/auth-service.js";

const runParamsSchema = z.object({ runId: z.uuid() }).strict();
const decisionBodySchema = z
  .object({ decisions: z.array(planDecisionSchema).max(50) })
  .strict()
  .refine(
    ({ decisions }) =>
      new Set(decisions.map((decision) => decision.variantId)).size === decisions.length,
    "Each item can be decided once",
  );

const send = (response: Response, plan: RestockPlanView): void => {
  response.status(200).json({ success: true, data: { plan }, meta: {}, error: null });
};
const adminIdOf = (request: { authenticatedUser?: { id: string } }) => {
  if (!request.authenticatedUser) {
    throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  }
  return request.authenticatedUser.id;
};

// The LangGraph restock planner. It changes stock only after the admin approves.
export const createRestockPlannerRouter = (
  authService: AuthService,
  plannerService: RestockPlannerService | undefined,
  clientUrl: string,
): Router => {
  const router = Router();
  const requireTrustedOrigin = createRequireTrustedOrigin(clientUrl);
  const startLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    keyGenerator: (request) => request.authenticatedUser?.id ?? "unauthenticated",
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(new HttpError(429, "RESTOCK_PLAN_RATE_LIMITED", "Try starting a plan again later."));
    },
  });
  const requirePlanner = () => {
    if (!plannerService) {
      throw new HttpError(503, "RESTOCK_PLANNER_DISABLED", "The restock planner is not enabled.");
    }
    return plannerService;
  };

  router.use(createAuthenticateStaff(authService), requireRoles("ADMIN"));
  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  router.get("/status", (_request, response) => {
    response.status(200).json({
      success: true,
      data: { planner: { enabled: Boolean(plannerService) } },
      meta: {},
      error: null,
    });
  });
  router.post(
    "/runs",
    requireTrustedOrigin,
    startLimit,
    asyncHandler(async (request, response) =>
      send(response, await requirePlanner().start(adminIdOf(request))),
    ),
  );
  router.get(
    "/runs/:runId",
    validateParams(runParamsSchema),
    asyncHandler(async (request, response) => {
      const { runId } = request.validatedParams as z.infer<typeof runParamsSchema>;
      send(response, await requirePlanner().get(runId, adminIdOf(request)));
    }),
  );
  router.post(
    "/runs/:runId/decision",
    requireTrustedOrigin,
    validateParams(runParamsSchema),
    validateBody(decisionBodySchema),
    asyncHandler(async (request, response) => {
      const { runId } = request.validatedParams as z.infer<typeof runParamsSchema>;
      const { decisions } = request.body as z.infer<typeof decisionBodySchema>;
      send(response, await requirePlanner().decide(runId, adminIdOf(request), decisions));
    }),
  );
  return router;
};
