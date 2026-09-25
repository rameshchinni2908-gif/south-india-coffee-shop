import { z } from "zod";

import { AGENT_RUN_OUTCOMES, AGENT_RUN_RATINGS } from "../types/agent-run.js";

export const adminBriefQuestionSchema = z.string().trim().min(1).max(500);
export const adminBriefBodySchema = z.object({ question: adminBriefQuestionSchema }).strict();

export const agentRunIdParamsSchema = z
  .object({ id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier") })
  .strict();

export const proposalIdParamsSchema = agentRunIdParamsSchema;

export const agentRunQuerySchema = z
  .object({
    outcome: z.enum(AGENT_RUN_OUTCOMES).optional(),
    rating: z.enum([...AGENT_RUN_RATINGS, "UNRATED"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const agentRunFeedbackBodySchema = z
  .object({
    rating: z.enum(AGENT_RUN_RATINGS),
    comment: z
      .string()
      .trim()
      .max(500)
      .transform((value) => value || null)
      .nullable()
      .default(null),
  })
  .strict();

export type AdminBriefInput = z.infer<typeof adminBriefBodySchema>;
export type AgentRunIdParams = z.infer<typeof agentRunIdParamsSchema>;
export type ProposalIdParams = z.infer<typeof proposalIdParamsSchema>;
export type AgentRunQuery = z.infer<typeof agentRunQuerySchema>;
export type AgentRunFeedbackInput = z.infer<typeof agentRunFeedbackBodySchema>;
