import { Router } from "express";

import { createCategoryController } from "../controllers/category-controller.js";
import { createAuthenticateStaff } from "../middleware/authenticate-staff.js";
import { validateBody } from "../middleware/validate-body.js";
import { validateParams } from "../middleware/validate-params.js";
import { validateQuery } from "../middleware/validate-query.js";
import type { CategoryService } from "../services/category-service.js";
import type { AuthService } from "../services/auth-service.js";
import {
  adminCategoryQuerySchema,
  createCategoryBodySchema,
  idParamsSchema,
  updateCategoryBodySchema,
} from "../validation/catalog-schemas.js";

export const createAdminCategoryRouter = (
  authService: AuthService,
  categoryService: CategoryService,
): Router => {
  const router = Router();
  const controller = createCategoryController(categoryService);

  router.use(createAuthenticateStaff(authService));
  router.get("/", validateQuery(adminCategoryQuerySchema), controller.listAdmin);
  router.post("/", validateBody(createCategoryBodySchema), controller.create);
  router.patch(
    "/:id",
    validateParams(idParamsSchema),
    validateBody(updateCategoryBodySchema),
    controller.update,
  );

  return router;
};
