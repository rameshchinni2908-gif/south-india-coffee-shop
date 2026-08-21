import { z } from "zod";

export const orderTrackingSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .min(1, "Enter your order number")
    .max(30, "Order number is too long")
    .transform((value) => value.toUpperCase()),
  customerMobile: z
    .string()
    .trim()
    .regex(/^(?:\+91)?[6-9]\d{9}$/, "Enter the mobile number used for the order"),
});

export type OrderTrackingValues = z.input<typeof orderTrackingSchema>;
