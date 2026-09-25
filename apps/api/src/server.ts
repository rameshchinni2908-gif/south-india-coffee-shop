import "dotenv/config";

import type { Server } from "node:http";

import pino from "pino";

import { createApp } from "./app.js";
import { createOpenAiEmbedder } from "./agents/openai-embeddings.js";
import { createOpenAiResponder } from "./agents/openai-responses.js";
import { createOpenAiStructuredResponder } from "./agents/openai-structured.js";
import { SHOP_ASSISTANT_RESPONDER_OPTIONS } from "./agents/shop-assistant-instructions.js";
import { configureDatabaseDns, connectDatabase, disconnectDatabase } from "./config/database.js";
import { loadEnvironment } from "./config/environment.js";
import { createSipModule } from "./modules/secret-sip/index.js";
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
import { MongooseActionProposalRepository } from "./repositories/action-proposal-repository.js";
import { MongooseAgentRunRepository } from "./repositories/agent-run-repository.js";
import { MongooseKnowledgeNoteRepository } from "./repositories/knowledge-note-repository.js";
import { MongooseCategoryRepository } from "./repositories/category-repository.js";
import { MongooseOrderRepository } from "./repositories/order-repository.js";
import { MongooseProductRepository } from "./repositories/product-repository.js";
import { MongooseReportRepository } from "./repositories/report-repository.js";
import { MongooseUserRepository } from "./repositories/user-repository.js";
import { createAuthService } from "./services/auth-service.js";
import { createActionProposalService } from "./services/action-proposal-service.js";
import { createAdminAgentService } from "./services/admin-agent-service.js";
import { createCategoryService } from "./services/category-service.js";
import { createKnowledgeService, type KnowledgeService } from "./services/knowledge-service.js";
import { createOrderAssistantService } from "./services/order-assistant-service.js";
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

// Adds any built-in notes the database lacks, then embeds pending notes in the background.
// Neither step can stop the API from starting; retrieval falls back to keywords meanwhile.
const prepareKnowledgeBase = async (knowledgeService: KnowledgeService): Promise<void> => {
  try {
    const inserted = await knowledgeService.ensureBuiltInNotes();
    if (inserted > 0) logger.info({ inserted }, "Built-in knowledge notes added");
  } catch (error) {
    logger.error({ err: error }, "Built-in knowledge notes could not be added");
  }
  if (!knowledgeService.getStatus().embeddings) return;
  knowledgeService
    .embedPending()
    .then(({ embedded }) => {
      if (embedded > 0) logger.info({ embedded }, "Knowledge notes embedded");
    })
    .catch(() => logger.warn("Knowledge notes could not be embedded; keyword retrieval remains"));
};

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
  const knowledgeService = createKnowledgeService({
    repository: new MongooseKnowledgeNoteRepository(),
    embedding: {
      model: environment.OPENAI_EMBEDDING_MODEL,
      dimensions: environment.OPENAI_EMBEDDING_DIMENSIONS,
    },
    vectorSearch: environment.KNOWLEDGE_VECTOR_SEARCH,
    ...(environment.OPENAI_API_KEY
      ? {
          embed: createOpenAiEmbedder({
            apiKey: environment.OPENAI_API_KEY,
            model: environment.OPENAI_EMBEDDING_MODEL,
            dimensions: environment.OPENAI_EMBEDDING_DIMENSIONS,
          }),
        }
      : {}),
  });
  await prepareKnowledgeBase(knowledgeService);
  const adminAgentService = createAdminAgentService({
    reportService,
    productService,
    agentRunRepository: new MongooseAgentRunRepository(),
    proposalService: createActionProposalService({
      repository: new MongooseActionProposalRepository(),
      productService,
    }),
    retrieveKnowledge: knowledgeService.retrieve,
    model: environment.OPENAI_MODEL,
    ...(environment.OPENAI_API_KEY
      ? {
          respond: createOpenAiResponder({
            apiKey: environment.OPENAI_API_KEY,
            model: environment.OPENAI_MODEL,
            ...SHOP_ASSISTANT_RESPONDER_OPTIONS,
          }),
        }
      : {}),
  });
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
  const sipModule = environment.GAME_ENABLED
    ? createSipModule({
        clientUrl: environment.CLIENT_URL,
        roomTtlMinutes: environment.GAME_ROOM_TTL_MINUTES,
        maxRoomsPerIpPerHour: environment.GAME_MAX_ROOMS_PER_IP_PER_HOUR,
      })
    : null;
  const orderAssistantService = createOrderAssistantService({
    productService,
    dailyLimit: environment.ORDER_ASSISTANT_DAILY_LIMIT,
    timezone: environment.SHOP_TIMEZONE,
    ...(environment.ORDER_ASSISTANT_ENABLED && environment.OPENAI_API_KEY
      ? {
          extract: createOpenAiStructuredResponder({
            apiKey: environment.OPENAI_API_KEY,
            model: environment.OPENAI_MODEL,
          }),
        }
      : {}),
  });
  const app = createApp({
    clientUrl: environment.CLIENT_URL,
    authService,
    isProduction: environment.NODE_ENV === "production",
    catalogServices: { categoryService, productService },
    orderService,
    orderAssistantService,
    reportService,
    staffAccountService,
    adminAgentService,
    knowledgeService,
    ...(environment.MCP_SERVER_TOKEN
      ? { mcp: { productService, reportService, token: environment.MCP_SERVER_TOKEN } }
      : {}),
    ...(gameModule ? { gameRouter: gameModule.router } : {}),
    ...(arenaModule ? { arenaRouter: arenaModule.router } : {}),
    ...(sipModule ? { sipRouter: sipModule.router } : {}),
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

  sipModule?.attachSocket(server);

  let isShuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, "Shutting down API server");

    try {
      await sipModule?.shutdown();
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
