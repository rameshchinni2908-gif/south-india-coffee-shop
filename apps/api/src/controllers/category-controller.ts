import type { RequestHandler } from "express";

import { asyncHandler } from "../middleware/async-handler.js";
import type { CategoryService } from "../services/category-service.js";
import type {
  AdminCategoryQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../validation/catalog-schemas.js";

export const createCategoryController = (
  categoryService: CategoryService,
): {
  listPublic: RequestHandler;
  listAdmin: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
} => ({
  listPublic: asyncHandler(async (_request, response) => {
    const categories = await categoryService.listPublic();

    response.status(200).json({
      success: true,
      data: { categories },
      meta: {},
      error: null,
    });
  }),

  listAdmin: asyncHandler(async (request, response) => {
    const result = await categoryService.listAdmin(request.validatedQuery as AdminCategoryQuery);

    response.status(200).json({
      success: true,
      data: { categories: result.items },
      meta: result.meta,
      error: null,
    });
  }),

  create: asyncHandler(async (request, response) => {
    const category = await categoryService.create(request.body as CreateCategoryInput);

    response.status(201).json({
      success: true,
      data: { category },
      meta: {},
      error: null,
    });
  }),

  update: asyncHandler(async (request, response) => {
    const { id } = request.validatedParams as { id: string };
    const category = await categoryService.update(id, request.body as UpdateCategoryInput);

    response.status(200).json({
      success: true,
      data: { category },
      meta: {},
      error: null,
    });
  }),
});
