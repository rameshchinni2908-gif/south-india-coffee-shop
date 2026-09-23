import type { RequestHandler } from "express";

import { asyncHandler } from "../middleware/async-handler.js";
import { HttpError } from "../middleware/http-error.js";
import type { AdminAgentService } from "../services/admin-agent-service.js";
import type {
  AdminBriefInput,
  AgentRunFeedbackInput,
  AgentRunIdParams,
  AgentRunQuery,
} from "../validation/admin-agent-schemas.js";

const requireAdminId: (request: Parameters<RequestHandler>[0]) => string = (request) => {
  const adminId = request.authenticatedUser?.id;
  if (!adminId) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return adminId;
};

export const createAdminAgentController = (
  adminAgentService: AdminAgentService,
): {
  getStatus: RequestHandler;
  createBriefing: RequestHandler;
  listRuns: RequestHandler;
  rateRun: RequestHandler;
} => ({
  getStatus: (_request, response) => {
    response.status(200).json({
      success: true,
      data: { agent: adminAgentService.getStatus() },
      meta: {},
      error: null,
    });
  },
  createBriefing: asyncHandler(async (request, response) => {
    const { question } = request.body as AdminBriefInput;
    const briefing = await adminAgentService.createBriefing(question, requireAdminId(request));
    response.status(200).json({
      success: true,
      data: { briefing },
      meta: {},
      error: null,
    });
  }),
  listRuns: asyncHandler(async (request, response) => {
    const runs = await adminAgentService.listRuns(request.validatedQuery as AgentRunQuery);
    response.status(200).json({ success: true, data: { runs }, meta: {}, error: null });
  }),
  rateRun: asyncHandler(async (request, response) => {
    const { id } = request.validatedParams as AgentRunIdParams;
    const run = await adminAgentService.rateRun(
      id,
      requireAdminId(request),
      request.body as AgentRunFeedbackInput,
    );
    response.status(200).json({ success: true, data: { run }, meta: {}, error: null });
  }),
});
