import { Router } from "express";

import { createProductController } from "../controllers/product-controller.js";
import { createAuthenticateStaff } from "../middleware/authenticate-staff.js";
import { requireRoles } from "../middleware/require-role.js";
import { validateBody } from "../middleware/validate-body.js";
import { validateParams } from "../middleware/validate-params.js";
import { validateQuery } from "../middleware/validate-query.js";
import type { AuthService } from "../services/auth-service.js";
import type { ProductService } from "../services/product-service.js";
import {
  adminProductQuerySchema,
  createProductBodySchema,
  idParamsSchema,
  updateAvailabilityBodySchema,
  updateProductBodySchema,
} from "../validation/catalog-schemas.js";

export const createAdminProductRouter = (
  authService: AuthService,
  productService: ProductService,
): Router => {
  const router = Router();
  const controller = createProductController(productService);

  router.use(createAuthenticateStaff(authService));
  router.get("/", validateQuery(adminProductQuerySchema), controller.listAdmin);
  router.post("/", validateBody(createProductBodySchema), controller.create);
  router.get("/:id", validateParams(idParamsSchema), controller.getAdminById);
  router.patch(
    "/:id/availability",
    validateParams(idParamsSchema),
    validateBody(updateAvailabilityBodySchema),
    controller.updateAvailability,
  );
  router.patch(
    "/:id",
    validateParams(idParamsSchema),
    validateBody(updateProductBodySchema),
    controller.update,
  );
  router.delete("/:id", validateParams(idParamsSchema), requireRoles("ADMIN"), controller.archive);

  return router;
};
