import { Router } from "express";

import { createOrderController } from "../controllers/order-controller.js";
import { createAuthenticateStaff } from "../middleware/authenticate-staff.js";
import { validateBody } from "../middleware/validate-body.js";
import { validateParams } from "../middleware/validate-params.js";
import { validateQuery } from "../middleware/validate-query.js";
import type { AuthService } from "../services/auth-service.js";
import type { OrderService } from "../services/order-service.js";
import { idParamsSchema } from "../validation/catalog-schemas.js";
import { adminOrderQuerySchema, updateOrderStatusBodySchema } from "../validation/order-schemas.js";

export const createAdminOrderRouter = (
  authService: AuthService,
  orderService: OrderService,
): Router => {
  const router = Router();
  const controller = createOrderController(orderService);

  router.use(createAuthenticateStaff(authService));
  router.get("/", validateQuery(adminOrderQuerySchema), controller.list);
  router.patch(
    "/:id/status",
    validateParams(idParamsSchema),
    validateBody(updateOrderStatusBodySchema),
    controller.updateStatus,
  );

  return router;
};
