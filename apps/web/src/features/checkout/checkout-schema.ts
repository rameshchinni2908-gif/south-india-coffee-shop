import { z } from "zod";

export const checkoutFormSchema = z.object({
  customerName: z.string().trim().min(2, "Enter your name").max(100),
  customerMobile: z
    .string()
    .trim()
    .regex(/^(?:\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  pickupTime: z.string().min(1, "Select a pickup time"),
  notes: z.string().trim().max(500, "Notes must be 500 characters or fewer"),
});

export type CheckoutFormValues = z.infer<typeof checkoutFormSchema>;

const getShopDateTimeParts = (date: Date): Record<string, string> =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

export const toShopDateTimeInput = (date: Date): string => {
  const parts = getShopDateTimeParts(date);

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

export const toPickupIso = (shopDateTime: string): string =>
  new Date(`${shopDateTime}:00+05:30`).toISOString();
