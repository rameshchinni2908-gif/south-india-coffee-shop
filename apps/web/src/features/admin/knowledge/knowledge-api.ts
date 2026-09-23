import { queryOptions } from "@tanstack/react-query";

import { apiGet, apiPatch, apiPost } from "../../../lib/api-client.js";

export type EmbeddingStatus = "CURRENT" | "STALE" | "MISSING" | "DISABLED";

export interface KnowledgeNote {
  id: string;
  slug: string;
  title: string;
  content: string;
  keywords: string[];
  isActive: boolean;
  embeddingStatus: EmbeddingStatus;
  embeddedAt: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface KnowledgeRetrievalStatus {
  embeddings: boolean;
  vectorSearch: "memory" | "atlas";
  model: string | null;
}

export interface KnowledgeNoteInput {
  title: string;
  content: string;
  keywords: string[];
  isActive: boolean;
}

export interface KnowledgeSearchResult {
  mode: "hybrid" | "keyword";
  fallbackReason: string | null;
  embeddingTokens: number;
  results: {
    slug: string;
    title: string;
    fusedScore: number;
    keyword: { rank: number; score: number } | null;
    vector: { rank: number; similarity: number } | null;
  }[];
}

export const ADMIN_KNOWLEDGE_QUERY_KEY = ["admin", "knowledge"] as const;

export const knowledgeNotesQuery = () =>
  queryOptions({
    queryKey: ADMIN_KNOWLEDGE_QUERY_KEY,
    queryFn: async ({ signal }) =>
      (
        await apiGet<{ notes: KnowledgeNote[]; retrieval: KnowledgeRetrievalStatus }>(
          "/api/admin/knowledge",
          signal,
        )
      ).data,
  });

export const createKnowledgeNote = async (input: KnowledgeNoteInput) =>
  (await apiPost<{ note: KnowledgeNote }, KnowledgeNoteInput>("/api/admin/knowledge", input)).data
    .note;

export const updateKnowledgeNote = async (slug: string, input: Partial<KnowledgeNoteInput>) =>
  (
    await apiPatch<{ note: KnowledgeNote }, Partial<KnowledgeNoteInput>>(
      `/api/admin/knowledge/${encodeURIComponent(slug)}`,
      input,
    )
  ).data.note;

export const embedPendingNotes = async () =>
  (
    await apiPost<{ embedded: number; tokens: number }, Record<string, never>>(
      "/api/admin/knowledge/embed",
      {},
    )
  ).data;

export const searchKnowledge = async (question: string) =>
  (
    await apiPost<{ search: KnowledgeSearchResult }, { question: string }>(
      "/api/admin/knowledge/search",
      { question },
    )
  ).data.search;
