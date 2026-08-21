import type { RequestHandler } from "express";

import { asyncHandler } from "../middleware/async-handler.js";
import type { OrderService } from "../services/order-service.js";
import type { CreateOrderInput } from "../validation/order-schemas.js";

export const createOrderController = (orderService: OrderService): { create: RequestHandler } => ({
  create: asyncHandler(async (request, response) => {
    const order = await orderService.create(request.body as CreateOrderInput);

    response.status(201).json({
      success: true,
      data: { order },
      meta: {},
      error: null,
    });
  }),
});
