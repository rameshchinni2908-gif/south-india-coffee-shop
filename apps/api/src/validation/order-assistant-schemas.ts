import { z } from "zod";

export const orderDraftBodySchema = z
  .object({ message: z.string().trim().min(1).max(300) })
  .strict();

export type OrderDraftInput = z.infer<typeof orderDraftBodySchema>;
