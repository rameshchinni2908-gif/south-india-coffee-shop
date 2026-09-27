import { apiGet, apiPost } from "../../../lib/api-client.js";

export interface RestockPlanItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  stockQuantity: number;
  suggestedPrep: number;
  suggestedQuantity: number;
  isAvailable: boolean;
  reason: string | null;
}

export interface RestockPlanResult {
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  status: "APPLIED" | "FAILED" | "SKIPPED";
  message: string | null;
}

export interface RestockPlan {
  runId: string;
  status: "AWAITING_APPROVAL" | "COMPLETED" | "NOTHING_TO_RESTOCK";
  date: string;
  summary: string | null;
  items: RestockPlanItem[];
  results: RestockPlanResult[];
}

export const RESTOCK_PLANNER_QUERY_KEY = ["admin", "restock-planner"] as const;

export const getRestockPlannerStatus = async (signal?: AbortSignal) =>
  (await apiGet<{ planner: { enabled: boolean } }>("/api/admin/restock-planner/status", signal))
    .data.planner;

export const getRestockPlan = async (runId: string, signal?: AbortSignal) =>
  (
    await apiGet<{ plan: RestockPlan }>(
      `/api/admin/restock-planner/runs/${encodeURIComponent(runId)}`,
      signal,
    )
  ).data.plan;

export const startRestockPlan = async () =>
  (
    await apiPost<{ plan: RestockPlan }, Record<string, never>>(
      "/api/admin/restock-planner/runs",
      {},
    )
  ).data.plan;

export const decideRestockPlan = async ({
  runId,
  decisions,
}: {
  runId: string;
  decisions: { variantId: string; quantity: number }[];
}) =>
  (
    await apiPost<{ plan: RestockPlan }, { decisions: { variantId: string; quantity: number }[] }>(
      `/api/admin/restock-planner/runs/${encodeURIComponent(runId)}/decision`,
      { decisions },
    )
  ).data.plan;
