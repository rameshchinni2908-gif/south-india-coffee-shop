import "dotenv/config";

import type { Server } from "node:http";

import pino from "pino";

import { createApp } from "./app.js";
import { configureDatabaseDns, connectDatabase, disconnectDatabase } from "./config/database.js";
import { loadEnvironment } from "./config/environment.js";
import {
  createArenaModule,
  MongooseArenaResultRepository,
  type ArenaModule,
} from "./modules/arena/index.js";
import {
  createGameModule,
  MongooseGameResultRepository,
  type GameModule,
} from "./modules/game/index.js";
import { MongooseCategoryRepository } from "./repositories/category-repository.js";
import { MongooseOrderRepository } from "./repositories/order-repository.js";
import { MongooseProductRepository } from "./repositories/product-repository.js";
import { MongooseReportRepository } from "./repositories/report-repository.js";
import { MongooseUserRepository } from "./repositories/user-repository.js";
import { createAuthService } from "./services/auth-service.js";
import { createCategoryService } from "./services/category-service.js";
import { createOrderService } from "./services/order-service.js";
import { createProductService } from "./services/product-service.js";
import { createReportService } from "./services/report-service.js";
import { createStaffAccountService } from "./services/staff-account-service.js";

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

  const userRepository = new MongooseUserRepository();
  const authService = createAuthService({
    userRepository,
    jwtSecret: environment.JWT_SECRET,
    jwtExpiresIn: environment.JWT_EXPIRES_IN,
  });
  const categoryRepository = new MongooseCategoryRepository();
  const categoryService = createCategoryService(categoryRepository);
  const productRepository = new MongooseProductRepository();
  const productService = createProductService(productRepository, categoryRepository);
  const orderService = createOrderService({
    orderRepository: new MongooseOrderRepository(),
    productRepository,
    categoryRepository,
    taxPercentage: environment.TAX_PERCENTAGE,
  });
  const reportService = createReportService({
    reportRepository: new MongooseReportRepository(),
    timezone: environment.SHOP_TIMEZONE,
  });
  const staffAccountService = createStaffAccountService(userRepository);
  const gameModule: GameModule | null = environment.GAME_ENABLED
    ? createGameModule({
        clientUrl: environment.CLIENT_URL,
        roomTtlMinutes: environment.GAME_ROOM_TTL_MINUTES,
        resultTtlHours: environment.GAME_RESULT_TTL_HOURS,
        maxRoomsPerIpPerHour: environment.GAME_MAX_ROOMS_PER_IP_PER_HOUR,
        resultRepository: new MongooseGameResultRepository(),
      })
    : null;
  // Both mini-games share one flag on purpose, so Render and Vercel need no new
  // configuration to run either. See BEAN-BLASTERS.md section 14.
  const arenaModule: ArenaModule | null = environment.GAME_ENABLED
    ? createArenaModule({
        clientUrl: environment.CLIENT_URL,
        roomTtlMinutes: environment.GAME_ROOM_TTL_MINUTES,
        resultTtlHours: environment.GAME_RESULT_TTL_HOURS,
        maxRoomsPerIpPerHour: environment.GAME_MAX_ROOMS_PER_IP_PER_HOUR,
        resultRepository: new MongooseArenaResultRepository(),
      })
    : null;
  const app = createApp({
    clientUrl: environment.CLIENT_URL,
    authService,
    isProduction: environment.NODE_ENV === "production",
    catalogServices: { categoryService, productService },
    orderService,
    reportService,
    staffAccountService,
    ...(gameModule ? { gameRouter: gameModule.router } : {}),
    ...(arenaModule ? { arenaRouter: arenaModule.router } : {}),
  });
  const server = app.listen(environment.PORT, () => {
    logger.info({ port: environment.PORT }, "API server listening");
  });

  if (gameModule) {
    gameModule.attachSocket(server);
    logger.info("Kaapi Karts game module enabled");
  }

  // Its own Socket.IO server on its own path, so neither game's realtime layer
  // has to know the other exists. See BEAN-BLASTERS.md section 8.
  if (arenaModule) {
    arenaModule.attachSocket(server);
    logger.info("Bean Blasters game module enabled");
  }

  let isShuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, "Shutting down API server");

    try {
      if (gameModule) {
        await gameModule.shutdown();
      }

      if (arenaModule) {
        await arenaModule.shutdown();
      }

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
