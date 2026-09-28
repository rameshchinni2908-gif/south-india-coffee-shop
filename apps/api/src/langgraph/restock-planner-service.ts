import { randomUUID } from "node:crypto";

import { Command } from "@langchain/langgraph";

import { HttpError } from "../middleware/http-error.js";
import {
  REVIEW_NODE,
  type PlanDecision,
  type PlanItem,
  type PlanResult,
  type RestockPlannerGraph,
} from "./restock-planner-graph.js";

export interface RestockPlanView {
  runId: string;
  status: "AWAITING_APPROVAL" | "COMPLETED" | "NOTHING_TO_RESTOCK";
  date: string;
  summary: string | null;
  items: PlanItem[];
  results: PlanResult[];
}

export interface RestockPlannerService {
  start(adminId: string): Promise<RestockPlanView>;
  get(runId: string, adminId: string): Promise<RestockPlanView>;
  decide(runId: string, adminId: string, decisions: PlanDecision[]): Promise<RestockPlanView>;
}

export const createRestockPlannerService = ({
  graph,
  newRunId = () => randomUUID(),
}: {
  graph: RestockPlannerGraph;
  newRunId?: () => string;
}): RestockPlannerService => {
  // Each run is a LangGraph thread; its id is the checkpointer's key.
  const configFor = (runId: string) => ({ configurable: { thread_id: runId } });
  // Two resumes of the same paused run would apply the plan twice. This process-local lock
  // is enough for the single API instance this shop runs.
  const resuming = new Set<string>();

  const view = async (runId: string, adminId: string): Promise<RestockPlanView> => {
    const snapshot = await graph.getState(configFor(runId));
    const state = snapshot.values;
    // Unknown runs and other admins' runs look the same: not found.
    if (!state.adminId || state.adminId !== adminId) {
      throw new HttpError(404, "RESTOCK_PLAN_NOT_FOUND", "That restock plan was not found.");
    }
    return {
      runId,
      status: snapshot.next.includes(REVIEW_NODE)
        ? "AWAITING_APPROVAL"
        : state.items.length === 0
          ? "NOTHING_TO_RESTOCK"
          : "COMPLETED",
      date: state.date,
      summary: state.summary,
      items: state.items,
      results: state.results,
    };
  };

  return {
    async start(adminId) {
      const runId = newRunId();
      // Runs "draft" and stops at the review pause (or ends if nothing needs restocking).
      await graph.invoke({ adminId, date: "" }, configFor(runId));
      return view(runId, adminId);
    },
    get: view,
    async decide(runId, adminId, decisions) {
      const current = await view(runId, adminId);
      if (current.status !== "AWAITING_APPROVAL" || resuming.has(runId)) {
        throw new HttpError(409, "RESTOCK_PLAN_DECIDED", "This restock plan was already decided.");
      }
      const known = new Set(current.items.map((item) => item.variantId));
      if (decisions.some((decision) => !known.has(decision.variantId))) {
        throw new HttpError(
          400,
          "VALIDATION_ERROR",
          "A decision refers to an item not in the plan.",
        );
      }
      resuming.add(runId);
      try {
        // The value passed to resume becomes the return value of interrupt() in "review".
        await graph.invoke(new Command({ resume: decisions }), configFor(runId));
      } finally {
        resuming.delete(runId);
      }
      return view(runId, adminId);
    },
  };
};
