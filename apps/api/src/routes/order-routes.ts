import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { createOrderController } from "../controllers/order-controller.js";
import { validateBody } from "../middleware/validate-body.js";
import type { OrderService } from "../services/order-service.js";
import { createOrderBodySchema, trackOrderBodySchema } from "../validation/order-schemas.js";

export const createOrderRouter = (orderService: OrderService): Router => {
  const router = Router();
  const controller = createOrderController(orderService);
  const trackingRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        success: false,
        data: null,
        meta: {},
        error: {
          code: "TOO_MANY_TRACKING_ATTEMPTS",
          message: "Too many tracking attempts. Please try again later",
        },
      });
    },
  });

  router.post("/", validateBody(createOrderBodySchema), controller.create);
  router.post("/track", trackingRateLimit, validateBody(trackOrderBodySchema), controller.track);

  return router;
};
