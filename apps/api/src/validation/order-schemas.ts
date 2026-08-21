import { z } from "zod";

import { ORDER_STATUSES } from "../types/order.js";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

const orderItemSchema = z
  .object({
    productId: objectIdSchema,
    variantId: objectIdSchema,
    quantity: z.number().int().min(1).max(20),
  })
  .strict();

export const createOrderBodySchema = z
  .object({
    customerName: z.string().trim().min(2).max(100),
    customerMobile: z
      .string()
      .trim()
      .regex(/^(?:\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
    items: z.array(orderItemSchema).min(1).max(20),
    pickupTime: z.string().datetime({ offset: true }),
    notes: z.string().trim().max(500).default(""),
  })
  .strict()
  .refine(
    (order) =>
      new Set(order.items.map((item) => `${item.productId}:${item.variantId}`)).size ===
      order.items.length,
    { message: "Order items must be unique", path: ["items"] },
  );

export const trackOrderBodySchema = z
  .object({
    orderNumber: z.string().trim().toUpperCase().min(1).max(40),
    customerMobile: z
      .string()
      .trim()
      .regex(/^(?:\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  })
  .strict();

export const adminOrderQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(100).optional(),
    status: z.enum(ORDER_STATUSES).optional(),
    sortBy: z.enum(["createdAt", "pickupTime"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export const updateOrderStatusBodySchema = z.object({ status: z.enum(ORDER_STATUSES) }).strict();

export type CreateOrderInput = z.infer<typeof createOrderBodySchema>;
export type TrackOrderInput = z.infer<typeof trackOrderBodySchema>;
export type AdminOrderQuery = z.infer<typeof adminOrderQuerySchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusBodySchema>;
