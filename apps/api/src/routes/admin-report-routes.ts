import { Router } from "express";

import { createReportController } from "../controllers/report-controller.js";
import { createAuthenticateStaff } from "../middleware/authenticate-staff.js";
import type { AuthService } from "../services/auth-service.js";
import type { ReportService } from "../services/report-service.js";

export const createAdminReportRouter = (
  authService: AuthService,
  reportService: ReportService,
): Router => {
  const router = Router();
  const controller = createReportController(reportService);

  router.use(createAuthenticateStaff(authService));
  router.get("/summary", controller.getSummary);

  return router;
};
