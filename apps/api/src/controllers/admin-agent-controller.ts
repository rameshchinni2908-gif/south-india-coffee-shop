import type { RequestHandler } from "express";

import { asyncHandler } from "../middleware/async-handler.js";
import type { AdminAgentService } from "../services/admin-agent-service.js";
import type { AdminBriefInput } from "../validation/admin-agent-schemas.js";

export const createAdminAgentController = (
  adminAgentService: AdminAgentService,
): { getStatus: RequestHandler; createBriefing: RequestHandler } => ({
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
    const briefing = await adminAgentService.createBriefing(question);
    response.status(200).json({
      success: true,
      data: { briefing },
      meta: {},
      error: null,
    });
  }),
});
