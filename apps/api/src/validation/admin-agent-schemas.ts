import { z } from "zod";

export const adminBriefQuestionSchema = z.string().trim().min(1).max(500);
export const adminBriefBodySchema = z.object({ question: adminBriefQuestionSchema }).strict();

export type AdminBriefInput = z.infer<typeof adminBriefBodySchema>;
