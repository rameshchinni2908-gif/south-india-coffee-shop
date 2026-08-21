import cors from "cors";
import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { getDatabaseState, type DatabaseState } from "./config/database.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found-handler.js";
import { createHealthRouter } from "./routes/health-routes.js";

interface CreateAppOptions {
  clientUrl: string;
  databaseState?: () => DatabaseState;
  enableRequestLogging?: boolean;
}

export const createApp = ({
  clientUrl,
  databaseState = getDatabaseState,
  enableRequestLogging = true,
}: CreateAppOptions): Express => {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: clientUrl,
      credentials: true,
    }),
  );

  if (enableRequestLogging) {
    app.use(
      pinoHttp({
        redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
      }),
    );
  }

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/health", createHealthRouter(databaseState));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
