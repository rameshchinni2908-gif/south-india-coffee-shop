import { z } from "zod";

export const sipCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{5}$/);
export const sipIdentitySchema = z
  .object({ code: sipCodeSchema, token: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
const round = z.number().int().nonnegative();
export const sipActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), round, ready: z.boolean() }).strict(),
  z.object({ type: z.enum(["start", "clue", "discussed", "rematch", "leave"]), round }).strict(),
  z.object({ type: z.enum(["vote", "remove"]), round, targetId: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal("guess"),
      round,
      word: z
        .string()
        .trim()
        .min(1)
        .max(40)
        .regex(/^[a-zA-Z0-9 '-]+$/),
    })
    .strict(),
]);
