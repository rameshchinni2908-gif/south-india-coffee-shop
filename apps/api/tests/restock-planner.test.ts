import { MemorySaver } from "@langchain/langgraph";
import { RunnableLambda } from "@langchain/core/runnables";
import { describe, expect, it, vi } from "vitest";

import { createRestockPlanner } from "../src/langgraph/create-restock-planner.js";
import { acceptExplanation, createRestockExplainer } from "../src/langgraph/restock-explainer.js";
import {
  buildRestockPlannerGraph,
  type PlanItem,
  type RestockPlannerDependencies,
} from "../src/langgraph/restock-planner-graph.js";
import { createRestockPlannerService } from "../src/langgraph/restock-planner-service.js";
import type { PrepForecastItem } from "../src/services/prep-forecast.js";

const forecastItem = (fields: Partial<PrepForecastItem>): PrepForecastItem => ({
  productId: "coffee",
  variantId: "coffee-regular",
  productName: "Filter Coffee",
  variantName: "Regular",
  daysCompared: 4,
  averageUnits: 19.5,
  highestUnits: 24,
  suggestedPrep: 22,
  stockQuantity: 10,
  isAvailable: true,
  restockNeeded: 12,
  lowConfidence: false,
  ...fields,
});
const FORECAST = {
  date: "2026-09-28",
  items: [
    forecastItem({}),
    forecastItem({
      productId: "vada",
      variantId: "vada-plate",
      productName: "Medu Vada",
      variantName: "Plate",
      suggestedPrep: 6,
      stockQuantity: 2,
      restockNeeded: 4,
      isAvailable: false,
    }),
    // Enough stock: not part of the plan.
    forecastItem({ variantId: "dosa-regular", productName: "Masala Dosa", restockNeeded: 0 }),
  ],
};

let runCounter = 0;
const createPlanner = (overrides: Partial<RestockPlannerDependencies> = {}) => {
  const dependencies = {
    getForecastItems: vi.fn(async () => FORECAST),
    applyRestock: vi.fn<RestockPlannerDependencies["applyRestock"]>(async () => ({
      applied: true,
      message: null,
    })),
    checkpointer: new MemorySaver(),
    ...overrides,
  };
  const service = createRestockPlannerService({
    graph: buildRestockPlannerGraph(dependencies),
    newRunId: () => `00000000-0000-4000-8000-${String((runCounter += 1)).padStart(12, "0")}`,
  });
  return { service, dependencies };
};

describe("LangGraph restock planner", () => {
  it("drafts a plan from the forecast and pauses for the admin", async () => {
    const explain = vi.fn(async (items: PlanItem[]) => ({
      summary: "Two sizes need restocking.",
      reasons: new Map([[items[0]!.variantId, "Stock 10 is below the usual 22."]]),
    }));
    const { service, dependencies } = createPlanner({ explain });

    const plan = await service.start("admin-1");

    expect(plan).toMatchObject({
      status: "AWAITING_APPROVAL",
      date: "2026-09-28",
      summary: "Two sizes need restocking.",
      results: [],
    });
    expect(
      plan.items.map(({ variantId, suggestedQuantity, reason }) => [
        variantId,
        suggestedQuantity,
        reason,
      ]),
    ).toEqual([
      ["coffee-regular", 12, "Stock 10 is below the usual 22."],
      ["vada-plate", 4, null],
    ]);
    expect(dependencies.applyRestock).not.toHaveBeenCalled();
  });

  it("applies only what the admin approved, with edited quantities", async () => {
    const { service, dependencies } = createPlanner();
    const { runId } = await service.start("admin-1");

    const done = await service.decide(runId, "admin-1", [
      { variantId: "coffee-regular", quantity: 15 },
      { variantId: "vada-plate", quantity: 0 },
    ]);

    expect(done.status).toBe("COMPLETED");
    expect(done.results).toEqual([
      expect.objectContaining({ variantId: "coffee-regular", quantity: 15, status: "APPLIED" }),
      expect.objectContaining({ variantId: "vada-plate", quantity: 0, status: "SKIPPED" }),
    ]);
    expect(dependencies.applyRestock).toHaveBeenCalledExactlyOnceWith(
      "admin-1",
      expect.objectContaining({ variantId: "coffee-regular" }),
      15,
    );
    // Resuming re-runs only the paused node, never the draft.
    expect(dependencies.getForecastItems).toHaveBeenCalledTimes(1);
  });

  it("resumes a paused plan after a restart, using only the saved checkpoint", async () => {
    const checkpointer = new MemorySaver();
    const before = createPlanner({ checkpointer });
    const { runId } = await before.service.start("admin-1");

    // A new graph and service, as after an API restart; the checkpointer is the only link.
    const after = createPlanner({ checkpointer });
    expect((await after.service.get(runId, "admin-1")).status).toBe("AWAITING_APPROVAL");
    const done = await after.service.decide(runId, "admin-1", [
      { variantId: "coffee-regular", quantity: 12 },
    ]);

    expect(done.results[0]).toMatchObject({ status: "APPLIED" });
    expect(after.dependencies.getForecastItems).not.toHaveBeenCalled();
    expect(after.dependencies.applyRestock).toHaveBeenCalledTimes(1);
  });

  it("finishes without pausing when nothing needs restocking", async () => {
    const explain = vi.fn();
    const { service } = createPlanner({
      explain,
      getForecastItems: vi.fn(async () => ({ date: "2026-09-28", items: [] })),
    });

    expect(await service.start("admin-1")).toMatchObject({
      status: "NOTHING_TO_RESTOCK",
      items: [],
    });
    expect(explain).not.toHaveBeenCalled();
  });

  it("keeps the plan when the explanation fails, and reports failed restocks", async () => {
    const { service } = createPlanner({
      explain: vi.fn().mockRejectedValue(new Error("model down")),
      applyRestock: vi.fn(async () => ({
        applied: false,
        message: "Plate changed since this was proposed.",
      })),
    });
    const { runId, items } = await service.start("admin-1");
    expect(items.every((item) => item.reason === null)).toBe(true);

    const done = await service.decide(runId, "admin-1", [{ variantId: "vada-plate", quantity: 4 }]);

    expect(done.results).toContainEqual(
      expect.objectContaining({
        variantId: "vada-plate",
        status: "FAILED",
        message: "Plate changed since this was proposed.",
      }),
    );
  });

  it("protects plans: owner only, decided once, known items only", async () => {
    const { service, dependencies } = createPlanner();
    const { runId } = await service.start("admin-1");

    await expect(service.get(runId, "admin-2")).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.decide(runId, "admin-2", [])).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.get("00000000-0000-4000-8000-999999999999", "admin-1"),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.decide(runId, "admin-1", [{ variantId: "not-in-plan", quantity: 1 }]),
    ).rejects.toMatchObject({ statusCode: 400 });

    await service.decide(runId, "admin-1", [{ variantId: "coffee-regular", quantity: 12 }]);
    await expect(
      service.decide(runId, "admin-1", [{ variantId: "coffee-regular", quantity: 12 }]),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(dependencies.applyRestock).toHaveBeenCalledTimes(1);
  });
});

describe("planner wiring to the existing services", () => {
  it("applies each approved item as an audited proposal", async () => {
    const propose = vi.fn().mockResolvedValue({
      status: "PROPOSED",
      proposalId: "p1",
      summary: "Filter Coffee: Regular stock 10 → 22",
      expiresAt: "2026-09-28T08:15:00.000Z",
      appliedNow: false,
    });
    const approve = vi.fn().mockResolvedValue({ id: "p1", status: "APPLIED", failureReason: null });
    const planner = await createRestockPlanner({
      prepBriefService: {
        getToday: vi.fn().mockResolvedValue({ date: FORECAST.date, forecast: FORECAST }),
      },
      proposalService: { propose, approve },
      checkpointer: new MemorySaver(),
    });
    const { runId } = await planner.start("admin-1");

    await planner.decide(runId, "admin-1", [{ variantId: "coffee-regular", quantity: 12 }]);

    expect(propose).toHaveBeenCalledWith("admin-1", {
      kind: "STOCK",
      productName: "Filter Coffee",
      variantName: "Regular",
      mode: "add",
      quantity: 12,
    });
    expect(approve).toHaveBeenCalledWith("p1", "admin-1");
  });
});

describe("LangChain explainer", () => {
  const items = FORECAST.items
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

  it("keeps only reasons for plan items that use the plan's own numbers", () => {
    const accepted = acceptExplanation(
      {
        summary: "Restock 12 coffees and 4 vada plates.",
        reasons: [
          { variantId: "coffee-regular", reason: "Stock 10 is below the usual 22." },
          { variantId: "vada-plate", reason: "Needs about 5 more." },
          { variantId: "invented", reason: "Not in the plan." },
        ],
      },
      items,
    );

    expect(accepted.summary).toBe("Restock 12 coffees and 4 vada plates.");
    expect([...accepted.reasons.keys()]).toEqual(["coffee-regular"]);
    expect(acceptExplanation({ summary: "Order 100 units.", reasons: [] }, items).summary).toBe(
      null,
    );
  });

  it("runs as a LangChain runnable and validates its output", async () => {
    const received: string[] = [];
    const chain = RunnableLambda.from(async ({ plan }: { plan: string }) => {
      received.push(plan);
      return {
        summary: "Two sizes need restocking.",
        reasons: [{ variantId: "vada-plate", reason: "Switched off; it stays unorderable." }],
      };
    });

    const explanation = await createRestockExplainer(chain)(items);

    // The chain gets the computed plan as data and only adds words.
    expect(JSON.parse(received[0]!)).toEqual(items);
    expect(explanation.summary).toBe("Two sizes need restocking.");
    expect(explanation.reasons.get("vada-plate")).toBe("Switched off; it stays unorderable.");
    await expect(
      createRestockExplainer(RunnableLambda.from(async () => ({ summary: 5 }) as never))(items),
    ).rejects.toThrow();
  });
});
