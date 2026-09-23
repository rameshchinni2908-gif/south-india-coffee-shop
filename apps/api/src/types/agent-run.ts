import type { AgentTrace } from "../agents/agent-trace.js";

export const AGENT_RUN_OUTCOMES = ["ANSWERED", "BLOCKED", "FAILED"] as const;
export const AGENT_RUN_RATINGS = ["UP", "DOWN"] as const;

export type AgentRunOutcome = (typeof AGENT_RUN_OUTCOMES)[number];
export type AgentRunRating = (typeof AGENT_RUN_RATINGS)[number];

export interface AgentRunFeedback {
  rating: AgentRunRating;
  comment: string | null;
  ratedAt: Date;
}

export interface NewAgentRun {
  adminId: string;
  question: string;
  outcome: AgentRunOutcome;
  answer: string | null;
  failureReason: string | null;
  sourceIds: string[];
  model: string | null;
  totalDurationMs: number;
  inputTokens: number;
  outputTokens: number;
  trace: AgentTrace;
  createdAt: Date;
}

export interface AgentRunRecord extends NewAgentRun {
  id: string;
  feedback: AgentRunFeedback | null;
}

export interface AgentRunFilters {
  outcome?: AgentRunOutcome | undefined;
  rating?: AgentRunRating | "UNRATED" | undefined;
  limit: number;
}
