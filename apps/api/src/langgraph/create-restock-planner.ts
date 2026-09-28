import type { BaseCheckpointSaver } from "@langchain/langgraph";

import type { ActionProposalService } from "../services/action-proposal-service.js";
import type { PrepBriefService } from "../services/prep-brief-service.js";
import { createRestockCheckpointer } from "./mongo-checkpointer.js";
import {
  buildRestockPlannerGraph,
  type PlanItem,
  type RestockExplanation,
} from "./restock-planner-graph.js";
import {
  createRestockPlannerService,
  type RestockPlannerService,
} from "./restock-planner-service.js";

// Connects the planner to the existing services. Only the checkpointer is LangGraph-specific.
export const createRestockPlanner = async ({
  prepBriefService,
  proposalService,
  explain,
  checkpointer,
}: {
  prepBriefService: Pick<PrepBriefService, "getToday">;
  proposalService: Pick<ActionProposalService, "propose" | "approve">;
  explain?: ((items: PlanItem[]) => Promise<RestockExplanation>) | undefined;
  // Defaults to MongoDB; tests pass LangGraph's in-memory saver.
  checkpointer?: BaseCheckpointSaver;
}): Promise<RestockPlannerService> => {
  const graph = buildRestockPlannerGraph({
    getForecastItems: async () => {
      const brief = await prepBriefService.getToday();
      return { date: brief.date, items: brief.forecast.items };
    },
    explain,
    applyRestock: async (adminId, item, quantity) => {
      // The same path as an assistant proposal: resolved against live stock, audited, and
      // applied only if the value has not changed in between.
      const proposal = await proposalService.propose(adminId, {
        kind: "STOCK",
        productName: item.productName,
        variantName: item.variantName,
        mode: "add",
        quantity,
      });
      if (proposal.status === "NOT_PROPOSED") return { applied: false, message: proposal.reason };
      const decided = await proposalService.approve(proposal.proposalId, adminId);
      return decided.status === "APPLIED"
        ? { applied: true, message: null }
        : { applied: false, message: decided.failureReason ?? "The restock was not applied." };
    },
    checkpointer: checkpointer ?? (await createRestockCheckpointer()),
  });
  return createRestockPlannerService({ graph });
};
