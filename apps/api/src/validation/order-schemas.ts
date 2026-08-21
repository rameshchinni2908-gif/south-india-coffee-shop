import { z } from "zod";

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

export type CreateOrderInput = z.infer<typeof createOrderBodySchema>;
