import type { RequestHandler } from "express";

import { asyncHandler } from "../middleware/async-handler.js";
import type { OrderService } from "../services/order-service.js";
import type {
  AdminOrderQuery,
  CreateOrderInput,
  TrackOrderInput,
  UpdateOrderStatusInput,
} from "../validation/order-schemas.js";

export const createOrderController = (
  orderService: OrderService,
): {
  create: RequestHandler;
  track: RequestHandler;
  list: RequestHandler;
  updateStatus: RequestHandler;
} => ({
  create: asyncHandler(async (request, response) => {
    const order = await orderService.create(request.body as CreateOrderInput);

    response.status(201).json({
      success: true,
      data: { order },
      meta: {},
      error: null,
    });
  }),

  track: asyncHandler(async (request, response) => {
    const order = await orderService.track(request.body as TrackOrderInput);

    response.status(200).json({ success: true, data: { order }, meta: {}, error: null });
  }),

  list: asyncHandler(async (request, response) => {
    const result = await orderService.list(request.validatedQuery as AdminOrderQuery);

    response.status(200).json({
      success: true,
      data: { orders: result.items },
      meta: result.meta,
      error: null,
    });
  }),

  updateStatus: asyncHandler(async (request, response) => {
    const { id } = request.validatedParams as { id: string };
    const order = await orderService.updateStatus(id, request.body as UpdateOrderStatusInput);

    response.status(200).json({ success: true, data: { order }, meta: {}, error: null });
  }),
});
