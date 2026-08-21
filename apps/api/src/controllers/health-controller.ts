import type { RequestHandler } from "express";

import type { DatabaseState } from "../config/database.js";
import { getHealthData } from "../services/health-service.js";

export const createHealthController = (getDatabaseState: () => DatabaseState): RequestHandler => {
  return (_request, response) => {
    const health = getHealthData(getDatabaseState());
    const statusCode = health.status === "ok" ? 200 : 503;

    response.status(statusCode).json({
      success: health.status === "ok",
      data: health,
      meta: {},
      error:
        health.status === "ok"
          ? null
          : {
              code: "DATABASE_UNAVAILABLE",
              message: "The database is unavailable",
            },
    });
  };
};
