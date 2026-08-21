import { Router } from "express";

import { createOrderController } from "../controllers/order-controller.js";
import { validateBody } from "../middleware/validate-body.js";
import type { OrderService } from "../services/order-service.js";
import { createOrderBodySchema } from "../validation/order-schemas.js";

export const createOrderRouter = (orderService: OrderService): Router => {
  const router = Router();
  const controller = createOrderController(orderService);

  router.post("/", validateBody(createOrderBodySchema), controller.create);

  return router;
};
