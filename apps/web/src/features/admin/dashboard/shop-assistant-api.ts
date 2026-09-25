import { apiGet, apiPatch, apiPost } from "../../../lib/api-client.js";

export interface ShopAssistantSource {
  id: string;
  title: string;
  kind: "knowledge" | "menu" | "report";
  excerpt: string;
}

export interface ProposalSummary {
  id: string;
  summary: string;
  expiresAt: string;
}

export interface ProposalDecision {
  id: string;
  summary: string;
  status: "PENDING" | "APPLYING" | "APPLIED" | "REJECTED" | "FAILED" | "EXPIRED";
  expiresAt: string;
  decidedAt: string | null;
  failureReason: string | null;
}

export interface ShopBriefing {
  answer: string;
  usedShopData: boolean;
  generatedAt: string;
  sources?: ShopAssistantSource[];
  // Changes the assistant prepared; nothing is applied until the admin approves.
  proposals?: ProposalSummary[];
  runId?: string;
}

export type AgentRunOutcome = "ANSWERED" | "BLOCKED" | "FAILED";
export type AgentRunRating = "UP" | "DOWN";

export interface AgentRun {
  id: string;
  question: string;
  outcome: AgentRunOutcome;
  answer: string | null;
  failureReason: string | null;
  sourceIds: string[];
  model: string | null;
  totalDurationMs: number;
  inputTokens: number;
  outputTokens: number;
  trace: {
    // Absent on runs saved before hybrid retrieval.
    retrieval?: {
      mode: "hybrid" | "keyword";
      durationMs: number;
      embeddingTokens: number;
      fallbackReason: string | null;
    } | null;
    retrievedKnowledge: {
      id: string;
      fusedScore?: number;
      keywordScore?: number | null;
      similarity?: number | null;
      // Keyword score stored by older runs.
      score?: number;
    }[];
    modelCalls: {
      durationMs: number;
      ok: boolean;
      inputTokens: number | null;
      outputTokens: number | null;
      requestedTools: string[];
    }[];
    toolCalls: { name: string; durationMs: number; ok: boolean }[];
  };
  feedback: { rating: AgentRunRating; comment: string | null; ratedAt: string } | null;
  createdAt: string;
}

export interface AgentRunFilters {
  outcome: AgentRunOutcome | "ALL";
  rating: AgentRunRating | "UNRATED" | "ALL";
}

export const getShopAssistantStatus = async (signal?: AbortSignal) => {
  const response = await apiGet<{ agent: { enabled: boolean } }>("/api/admin/agent/status", signal);

  return response.data.agent;
};

export const generateShopBriefing = async (question: string): Promise<ShopBriefing> => {
  const response = await apiPost<{ briefing: ShopBriefing }, { question: string }>(
    "/api/admin/agent/brief",
    { question },
  );

  return response.data.briefing;
};

export const rateShopAnswer = async ({
  runId,
  rating,
  comment,
}: {
  runId: string;
  rating: AgentRunRating;
  comment: string | null;
}): Promise<AgentRun> => {
  const response = await apiPatch<
    { run: AgentRun },
    { rating: AgentRunRating; comment: string | null }
  >(`/api/admin/agent/runs/${encodeURIComponent(runId)}/feedback`, { rating, comment });

  return response.data.run;
};

export const getAgentRuns = async (
  filters: AgentRunFilters,
  signal?: AbortSignal,
): Promise<AgentRun[]> => {
  const params = new URLSearchParams({ limit: "50" });
  if (filters.outcome !== "ALL") params.set("outcome", filters.outcome);
  if (filters.rating !== "ALL") params.set("rating", filters.rating);
  const response = await apiGet<{ runs: AgentRun[] }>(`/api/admin/agent/runs?${params}`, signal);

  return response.data.runs;
};

export const decideProposal = async ({
  id,
  decision,
}: {
  id: string;
  decision: "approve" | "reject";
}): Promise<ProposalDecision> => {
  const response = await apiPost<{ proposal: ProposalDecision }, Record<string, never>>(
    `/api/admin/agent/proposals/${encodeURIComponent(id)}/${decision}`,
    {},
  );

  return response.data.proposal;
};
