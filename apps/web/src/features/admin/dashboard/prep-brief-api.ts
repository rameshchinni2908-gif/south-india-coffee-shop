import { queryOptions } from "@tanstack/react-query";

import { apiGet, apiPost } from "../../../lib/api-client.js";

export interface PrepForecastItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  daysCompared: number;
  averageUnits: number;
  highestUnits: number;
  suggestedPrep: number;
  orderedToday: number;
  stockQuantity: number;
  isAvailable: boolean;
  restockNeeded: number;
  lowConfidence: boolean;
}

export interface PrepBrief {
  date: string;
  forecast: { date: string; weekday: string; weeksLookedBack: number; items: PrepForecastItem[] };
  narrative: string | null;
  narrativeStatus: "WRITTEN" | "SKIPPED" | "REJECTED" | "FAILED" | "OUTDATED";
  generatedAt: string;
}

export const PREP_BRIEF_QUERY_KEY = ["admin", "prep-brief", "today"] as const;

export const prepBriefQuery = () =>
  queryOptions({
    queryKey: PREP_BRIEF_QUERY_KEY,
    queryFn: async ({ signal }) =>
      (await apiGet<{ brief: PrepBrief }>("/api/admin/prep-brief/today", signal)).data.brief,
    // Stock columns are live, so refetch soon; the forecast itself changes once a day.
    staleTime: 30_000,
    retry: false,
  });

export const regeneratePrepBrief = async () =>
  (
    await apiPost<{ brief: PrepBrief }, Record<string, never>>(
      "/api/admin/prep-brief/today/regenerate",
      {},
    )
  ).data.brief;
