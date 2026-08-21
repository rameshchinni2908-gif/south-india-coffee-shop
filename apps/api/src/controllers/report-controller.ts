import type { RequestHandler } from "express";

import { asyncHandler } from "../middleware/async-handler.js";
import type { ReportService } from "../services/report-service.js";

export const createReportController = (
  reportService: ReportService,
): { getSummary: RequestHandler } => ({
  getSummary: asyncHandler(async (_request, response) => {
    const summary = await reportService.getSummary();

    response.status(200).json({
      success: true,
      data: { summary },
      meta: {},
      error: null,
    });
  }),
});
