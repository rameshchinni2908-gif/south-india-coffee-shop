import "dotenv/config";

import type { Server } from "node:http";

import pino from "pino";

import { createApp } from "./app.js";
import { configureDatabaseDns, connectDatabase, disconnectDatabase } from "./config/database.js";
import { loadEnvironment } from "./config/environment.js";
import { MongooseCategoryRepository } from "./repositories/category-repository.js";
import { MongooseProductRepository } from "./repositories/product-repository.js";
import { MongooseUserRepository } from "./repositories/user-repository.js";
import { createAuthService } from "./services/auth-service.js";
import { createCategoryService } from "./services/category-service.js";
import { createProductService } from "./services/product-service.js";

const logger = pino();

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const startServer = async (): Promise<void> => {
  const environment = loadEnvironment();

  configureDatabaseDns(environment.MONGODB_DNS_SERVERS);
  await connectDatabase(environment.MONGODB_URI);
  logger.info("MongoDB connection established");

  const authService = createAuthService({
    userRepository: new MongooseUserRepository(),
    jwtSecret: environment.JWT_SECRET,
    jwtExpiresIn: environment.JWT_EXPIRES_IN,
  });
  const categoryRepository = new MongooseCategoryRepository();
  const categoryService = createCategoryService(categoryRepository);
  const productService = createProductService(new MongooseProductRepository(), categoryRepository);
  const app = createApp({
    clientUrl: environment.CLIENT_URL,
    authService,
    isProduction: environment.NODE_ENV === "production",
    catalogServices: { categoryService, productService },
  });
  const server = app.listen(environment.PORT, () => {
    logger.info({ port: environment.PORT }, "API server listening");
  });

  let isShuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, "Shutting down API server");

    try {
      await closeServer(server);
      await disconnectDatabase();
      logger.info("API server stopped");
    } catch (error) {
      logger.error({ err: error }, "Graceful shutdown failed");
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
};

startServer().catch((error: unknown) => {
  logger.fatal({ err: error }, "API server failed to start");
  process.exitCode = 1;
});
