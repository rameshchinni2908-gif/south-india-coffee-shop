import { Router } from "express";

import type { DatabaseState } from "../config/database.js";
import { createHealthController } from "../controllers/health-controller.js";

export const createHealthRouter = (getDatabaseState: () => DatabaseState): Router => {
  const router = Router();

  router.get("/", createHealthController(getDatabaseState));

  return router;
};
