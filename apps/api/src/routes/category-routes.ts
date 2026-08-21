import { Router } from "express";

import { createCategoryController } from "../controllers/category-controller.js";
import type { CategoryService } from "../services/category-service.js";

export const createCategoryRouter = (categoryService: CategoryService): Router => {
  const router = Router();
  const controller = createCategoryController(categoryService);

  router.get("/", controller.listPublic);

  return router;
};
