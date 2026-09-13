import { apiGet, apiPost } from "../../../lib/api-client.js";

export interface ShopAssistantSource {
  id: string;
  title: string;
  kind: "knowledge" | "menu" | "report";
  excerpt: string;
}

export interface ShopBriefing {
  answer: string;
  usedShopData: boolean;
  generatedAt: string;
  sources?: ShopAssistantSource[];
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
