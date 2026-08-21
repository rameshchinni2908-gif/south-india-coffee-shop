import { Router } from "express";

import { createProductController } from "../controllers/product-controller.js";
import { validateParams } from "../middleware/validate-params.js";
import { validateQuery } from "../middleware/validate-query.js";
import type { ProductService } from "../services/product-service.js";
import { publicProductQuerySchema, slugParamsSchema } from "../validation/catalog-schemas.js";

export const createProductRouter = (productService: ProductService): Router => {
  const router = Router();
  const controller = createProductController(productService);

  router.get("/", validateQuery(publicProductQuerySchema), controller.listPublic);
  router.get("/:slug", validateParams(slugParamsSchema), controller.getPublicBySlug);

  return router;
};
