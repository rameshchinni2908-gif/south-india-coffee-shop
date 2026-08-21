import type { Request, RequestHandler } from "express";

import { asyncHandler } from "../middleware/async-handler.js";
import { HttpError } from "../middleware/http-error.js";
import type { ProductService } from "../services/product-service.js";
import type {
  AdminProductQuery,
  CreateProductInput,
  PublicProductQuery,
  UpdateAvailabilityInput,
  UpdateProductInput,
} from "../validation/catalog-schemas.js";

const getAuthenticatedUser = (request: Request) => {
  if (!request.authenticatedUser) {
    throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  }

  return request.authenticatedUser;
};

export const createProductController = (
  productService: ProductService,
): {
  listPublic: RequestHandler;
  getPublicBySlug: RequestHandler;
  listAdmin: RequestHandler;
  getAdminById: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  updateAvailability: RequestHandler;
  archive: RequestHandler;
} => ({
  listPublic: asyncHandler(async (request, response) => {
    const result = await productService.listPublic(request.validatedQuery as PublicProductQuery);

    response.status(200).json({
      success: true,
      data: { products: result.items },
      meta: result.meta,
      error: null,
    });
  }),

  getPublicBySlug: asyncHandler(async (request, response) => {
    const { slug } = request.validatedParams as { slug: string };
    const product = await productService.getPublicBySlug(slug);

    response.status(200).json({
      success: true,
      data: { product },
      meta: {},
      error: null,
    });
  }),

  listAdmin: asyncHandler(async (request, response) => {
    const result = await productService.listAdmin(request.validatedQuery as AdminProductQuery);

    response.status(200).json({
      success: true,
      data: { products: result.items },
      meta: result.meta,
      error: null,
    });
  }),

  getAdminById: asyncHandler(async (request, response) => {
    const { id } = request.validatedParams as { id: string };
    const product = await productService.getAdminById(id);

    response.status(200).json({
      success: true,
      data: { product },
      meta: {},
      error: null,
    });
  }),

  create: asyncHandler(async (request, response) => {
    const product = await productService.create(request.body as CreateProductInput);

    response.status(201).json({
      success: true,
      data: { product },
      meta: {},
      error: null,
    });
  }),

  update: asyncHandler(async (request, response) => {
    const { id } = request.validatedParams as { id: string };
    const actor = getAuthenticatedUser(request);
    const product = await productService.update(id, request.body as UpdateProductInput, actor.id);

    response.status(200).json({
      success: true,
      data: { product },
      meta: {},
      error: null,
    });
  }),

  updateAvailability: asyncHandler(async (request, response) => {
    const { id } = request.validatedParams as { id: string };
    const product = await productService.updateAvailability(
      id,
      request.body as UpdateAvailabilityInput,
    );

    response.status(200).json({
      success: true,
      data: { product },
      meta: {},
      error: null,
    });
  }),

  archive: asyncHandler(async (request, response) => {
    const { id } = request.validatedParams as { id: string };
    const actor = getAuthenticatedUser(request);
    const product = await productService.archive(id, actor);

    response.status(200).json({
      success: true,
      data: { product },
      meta: {},
      error: null,
    });
  }),
});
