import cors from "cors";
import express, { type Express, type Router } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { getDatabaseState, type DatabaseState } from "./config/database.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found-handler.js";
import { createAdminAgentRouter } from "./routes/admin-agent-routes.js";
import { createAdminCategoryRouter } from "./routes/admin-category-routes.js";
import { createAdminOrderRouter } from "./routes/admin-order-routes.js";
import { createAdminProductRouter } from "./routes/admin-product-routes.js";
import { createAdminReportRouter } from "./routes/admin-report-routes.js";
import { createAdminStaffAccountRouter } from "./routes/admin-staff-account-routes.js";
import { createAuthRouter } from "./routes/auth-routes.js";
import { createCategoryRouter } from "./routes/category-routes.js";
import { createHealthRouter } from "./routes/health-routes.js";
import { createOrderRouter } from "./routes/order-routes.js";
import { createProductRouter } from "./routes/product-routes.js";
import type { AuthService } from "./services/auth-service.js";
import type { AdminAgentService } from "./services/admin-agent-service.js";
import type { CategoryService } from "./services/category-service.js";
import type { ProductService } from "./services/product-service.js";
import type { OrderService } from "./services/order-service.js";
import type { ReportService } from "./services/report-service.js";
import type { StaffAccountService } from "./services/staff-account-service.js";

interface CatalogServices {
  categoryService: CategoryService;
  productService: ProductService;
}

interface CreateAppOptions {
  clientUrl: string;
  authService: AuthService;
  isProduction: boolean;
  catalogServices?: CatalogServices;
  orderService?: OrderService;
  reportService?: ReportService;
  adminAgentService?: AdminAgentService;
  staffAccountService?: StaffAccountService;
  gameRouter?: Router;
  arenaRouter?: Router;
  sipRouter?: Router;
  databaseState?: () => DatabaseState;
  enableRequestLogging?: boolean;
}

export const createApp = ({
  clientUrl,
  authService,
  isProduction,
  catalogServices,
  orderService,
  reportService,
  adminAgentService,
  staffAccountService,
  gameRouter,
  arenaRouter,
  sipRouter,
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
  app.use("/api/auth", createAuthRouter({ authService, isProduction }));

  if (staffAccountService) {
    app.use(
      "/api/admin/staff-accounts",
      createAdminStaffAccountRouter(authService, staffAccountService),
    );
  }

  if (catalogServices) {
    app.use("/api/categories", createCategoryRouter(catalogServices.categoryService));
    app.use("/api/products", createProductRouter(catalogServices.productService));
    app.use(
      "/api/admin/categories",
      createAdminCategoryRouter(authService, catalogServices.categoryService),
    );
    app.use(
      "/api/admin/products",
      createAdminProductRouter(authService, catalogServices.productService),
    );
  }

  if (orderService) {
    app.use("/api/orders", createOrderRouter(orderService));
    app.use("/api/admin/orders", createAdminOrderRouter(authService, orderService));
  }

  if (reportService) {
    app.use("/api/admin/reports", createAdminReportRouter(authService, reportService));
  }

  if (adminAgentService) {
    app.use("/api/admin/agent", createAdminAgentRouter(authService, adminAgentService, clientUrl));
  }

  // Mounted only when GAME_ENABLED, so the Kaapi Karts module can ship dark.
  if (gameRouter) {
    app.use("/api/game", gameRouter);
  }

  // The second mini-game, behind the same flag. Independent of the kart module
  // in every respect except the flag — see BEAN-BLASTERS.md section 3.
  if (arenaRouter) {
    app.use("/api/arena", arenaRouter);
  }

  if (sipRouter) {
    app.use("/api/sip", sipRouter);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
