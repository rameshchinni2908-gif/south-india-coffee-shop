import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { createAuthController } from "../controllers/auth-controller.js";
import { createAuthenticateStaff } from "../middleware/authenticate-staff.js";
import type { AuthService } from "../services/auth-service.js";
import { loginBodySchema } from "../validation/auth-schemas.js";
import { validateBody } from "../middleware/validate-body.js";

interface CreateAuthRouterOptions {
  authService: AuthService;
  isProduction: boolean;
}

export const createAuthRouter = ({
  authService,
  isProduction,
}: CreateAuthRouterOptions): Router => {
  const router = Router();
  const controller = createAuthController({ authService, isProduction });
  const authenticateStaff = createAuthenticateStaff(authService);
  const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        success: false,
        data: null,
        meta: {},
        error: {
          code: "TOO_MANY_LOGIN_ATTEMPTS",
          message: "Too many login attempts. Please try again later",
        },
      });
    },
  });

  router.post("/login", loginRateLimit, validateBody(loginBodySchema), controller.login);
  router.post("/logout", controller.logout);
  router.get("/me", authenticateStaff, controller.me);

  return router;
};
