import {
  END,
  START,
  StateGraph,
  StateSchema,
  interrupt,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import { z } from "zod";

import { MAX_PROPOSED_STOCK } from "../agents/action-proposals.js";
import type { PrepForecastItem } from "../services/prep-forecast.js";

// One size the planner suggests restocking. Quantities come from the prep forecast (code);
// the reason is optional text from the model.
export const planItemSchema = z.object({
  productId: z.string(),
  variantId: z.string(),
  productName: z.string(),
  variantName: z.string(),
  stockQuantity: z.number().int(),
  suggestedPrep: z.number().int(),
  suggestedQuantity: z.number().int().min(1),
  isAvailable: z.boolean(),
  reason: z.string().nullable(),
});
export type PlanItem = z.infer<typeof planItemSchema>;

// The admin's answer to the pause: how many units to add for each size (0 = skip).
export const planDecisionSchema = z.object({
  variantId: z.string(),
  quantity: z.number().int().min(0).max(MAX_PROPOSED_STOCK),
});
export type PlanDecision = z.infer<typeof planDecisionSchema>;

export const planResultSchema = z.object({
  variantId: z.string(),
  productName: z.string(),
  variantName: z.string(),
  quantity: z.number().int(),
  status: z.enum(["APPLIED", "FAILED", "SKIPPED"]),
  message: z.string().nullable(),
});
export type PlanResult = z.infer<typeof planResultSchema>;

// Everything the checkpointer saves between the pause and the resume.
export const RestockPlanState = new StateSchema({
  adminId: z.string(),
  date: z.string(),
  items: z.array(planItemSchema).default(() => []),
  summary: z.string().nullable().default(null),
  decisions: z.array(planDecisionSchema).default(() => []),
  results: z.array(planResultSchema).default(() => []),
});

export interface RestockExplanation {
  summary: string | null;
  reasons: Map<string, string>;
}

export interface RestockPlannerDependencies {
  // Today's forecast from the prep brief (deterministic maths).
  getForecastItems(): Promise<{ date: string; items: PrepForecastItem[] }>;
  // Optional LangChain step that explains the plan; absent means no model is configured.
  explain?: ((items: PlanItem[]) => Promise<RestockExplanation>) | undefined;
  // Applies one approved restock through the existing proposal service.
  applyRestock(
    adminId: string,
    item: PlanItem,
    quantity: number,
  ): Promise<{ applied: boolean; message: string | null }>;
  checkpointer: BaseCheckpointSaver;
}

export const REVIEW_NODE = "review";

/**
 * draft → review (pauses for the admin) → apply.
 * LangGraph saves the state at the pause, so the plan survives page reloads and restarts,
 * and resumes exactly where it stopped when the admin answers.
 */
export const buildRestockPlannerGraph = ({
  getForecastItems,
  explain,
  applyRestock,
  checkpointer,
}: RestockPlannerDependencies) =>
  new StateGraph(RestockPlanState)
    .addNode("draft", async () => {
      const forecast = await getForecastItems();
      const items: PlanItem[] = forecast.items
        .filter((item) => item.restockNeeded > 0)
        .map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          variantName: item.variantName,
          stockQuantity: item.stockQuantity,
          suggestedPrep: item.suggestedPrep,
          suggestedQuantity: item.restockNeeded,
          isAvailable: item.isAvailable,
          reason: null,
        }));
      if (items.length === 0 || !explain) return { date: forecast.date, items };
      // The explanation is decoration: if the model fails, the plan is still complete.
      const explanation = await explain(items).catch(() => null);
      return {
        date: forecast.date,
        summary: explanation?.summary ?? null,
        items: items.map((item) => ({
          ...item,
          reason: explanation?.reasons.get(item.variantId) ?? null,
        })),
      };
    })
    .addNode(REVIEW_NODE, (state) => {
      // Resuming re-runs this node from the top, so nothing before interrupt() may have side
      // effects. interrupt() returns the admin's decisions once the graph is resumed.
      const answer = interrupt({ items: state.items, summary: state.summary });
      const decisions = z.array(planDecisionSchema).parse(answer);
      const known = new Set(state.items.map((item) => item.variantId));
      return { decisions: decisions.filter((decision) => known.has(decision.variantId)) };
    })
    .addNode("apply", async (state) => {
      const results: PlanResult[] = [];
      for (const item of state.items) {
        const quantity =
          state.decisions.find((decision) => decision.variantId === item.variantId)?.quantity ?? 0;
        const base = {
          variantId: item.variantId,
          productName: item.productName,
          variantName: item.variantName,
          quantity,
        };
        if (quantity === 0) {
          results.push({ ...base, status: "SKIPPED", message: null });
          continue;
        }
        try {
          const outcome = await applyRestock(state.adminId, item, quantity);
          results.push({
            ...base,
            status: outcome.applied ? "APPLIED" : "FAILED",
            message: outcome.message,
          });
        } catch {
          results.push({ ...base, status: "FAILED", message: "The restock could not be applied." });
        }
      }
      return { results };
    })
    .addEdge(START, "draft")
    // Nothing to restock: finish without pausing.
    .addConditionalEdges("draft", (state) => (state.items.length === 0 ? END : REVIEW_NODE), [
      REVIEW_NODE,
      END,
    ])
    .addEdge(REVIEW_NODE, "apply")
    .addEdge("apply", END)
    .compile({ checkpointer });

export type RestockPlannerGraph = ReturnType<typeof buildRestockPlannerGraph>;
