import { describe, expect, it, vi } from "vitest";

import type { ModelResponse, Respond } from "../src/agents/openai-responses.js";
import { createAdminAgentService } from "../src/services/admin-agent-service.js";
import type { ReportService } from "../src/services/report-service.js";
import type { DashboardSummary } from "../src/types/report.js";

const summary: DashboardSummary = {
  generatedAt: new Date("2026-09-10T08:00:00.000Z"),
  timezone: "Asia/Kolkata",
  today: {
    totalOrders: 2,
    orderCount: 1,
    salesTotal: 4550,
    itemsSold: 1,
    statusCounts: { PLACED: 1, CONFIRMED: 0, PREPARING: 0, READY: 0, COMPLETED: 1, CANCELLED: 0 },
  },
  month: { orderCount: 20, salesTotal: 90000, itemsSold: 20 },
  lowStockTotal: 1,
  lowStockVariants: [
    {
      productId: "private-product-id",
      productSlug: "coffee-powder",
      productName: "Coffee powder",
      variantId: "private-variant-id",
      variantName: "Regular",
      sku: "private-sku",
      stockQuantity: 5,
      lowStockThreshold: 5,
      isAvailable: true,
    },
  ],
  recentPriceChanges: [
    {
      id: "private-price-id",
      productId: "private-product-id",
      productName: "Coffee powder",
      variantId: "private-variant-id",
      variantSku: "private-sku",
      oldPrice: 4000,
      newPrice: 4550,
      changedBy: "private-staff-id",
      changedByName: "Private Staff Name",
      changedAt: new Date("2026-09-10T07:00:00.000Z"),
    },
  ],
};

const toolRequest: ModelResponse = {
  status: "completed",
  output: [
    { type: "function_call", name: "get_shop_summary", arguments: "{}", call_id: "call_summary" },
  ],
};
const modelAnswer: ModelResponse = {
  status: "completed",
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: "Coffee powder — Regular is at 5." }],
    },
  ],
};
const createDependencies = () => ({
  reportService: { getSummary: vi.fn<ReportService["getSummary"]>().mockResolvedValue(summary) },
  respond: vi.fn<Respond>(),
  now: () => new Date("2026-09-10T08:01:00.000Z"),
});

describe("production admin agent service", () => {
  it("runs the real tool loop against the report service and sends only the allowed projection", async () => {
    const deps = createDependencies();
    deps.respond.mockResolvedValueOnce(toolRequest).mockResolvedValueOnce(modelAnswer);
    const service = createAdminAgentService(deps);

    expect(service.getStatus()).toEqual({ enabled: true });
    expect(await service.createBriefing("  What is low on stock?  ")).toEqual({
      answer: "Coffee powder — Regular is at 5.",
      usedShopData: true,
      generatedAt: "2026-09-10T08:00:00.000Z",
    });
    expect(deps.reportService.getSummary).toHaveBeenCalledTimes(1);
    expect(deps.respond).toHaveBeenCalledTimes(2);
    expect(deps.respond.mock.calls[0]?.[0].input[0]).toEqual({
      role: "user",
      content: "What is low on stock?",
    });
    const toolOutput = deps.respond.mock.calls[1]?.[0].input.find(
      (item) => item.type === "function_call_output",
    );
    expect(toolOutput).toMatchObject({ call_id: "call_summary" });
    const sent = String(toolOutput?.output);
    expect(JSON.parse(sent)).toMatchObject({
      generatedAt: "2026-09-10T08:00:00.000Z",
      completedSalesUpdatedToday: { salesTotalPaise: 4550, salesTotalFormatted: "₹45.50" },
      lowStock: {
        listedVariants: [
          { productName: "Coffee powder", variantName: "Regular", stockQuantity: 5 },
        ],
      },
    });
    expect(sent).not.toMatch(/private|Private Staff|recentPriceChanges|month|sku/);
  });

  it("keeps the API available without a configured model and performs no report reads", async () => {
    const deps = createDependencies();
    const service = createAdminAgentService({ reportService: deps.reportService });
    expect(service.getStatus()).toEqual({ enabled: false });
    await expect(service.createBriefing("Summarize today")).rejects.toMatchObject({
      statusCode: 503,
      code: "AGENT_NOT_CONFIGURED",
    });
    expect(deps.reportService.getSummary).not.toHaveBeenCalled();
  });

  it("dates scope-only responses at generation time without reading the database", async () => {
    const deps = createDependencies();
    deps.respond.mockResolvedValue(modelAnswer);
    expect(await createAdminAgentService(deps).createBriefing("Explain your scope")).toMatchObject({
      usedShopData: false,
      generatedAt: "2026-09-10T08:01:00.000Z",
    });
    expect(deps.reportService.getSummary).not.toHaveBeenCalled();
  });

  it("rejects overlapping briefings and releases the guard after completion", async () => {
    const deps = createDependencies();
    let finish: (value: ModelResponse) => void = () => undefined;
    deps.respond
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(modelAnswer);
    const service = createAdminAgentService(deps);
    const first = service.createBriefing("First question");
    await expect(service.createBriefing("Second question")).rejects.toMatchObject({
      statusCode: 429,
      code: "AGENT_BUSY",
    });
    expect(deps.respond).toHaveBeenCalledTimes(1);
    finish(modelAnswer);
    await first;
    await expect(service.createBriefing("Third question")).resolves.toMatchObject({
      usedShopData: false,
    });
  });

  it("replaces provider failures with a safe error, never retries, and releases the guard", async () => {
    const deps = createDependencies();
    deps.respond
      .mockRejectedValueOnce(new Error("secret-key private provider body"))
      .mockResolvedValue(modelAnswer);
    const service = createAdminAgentService(deps);
    await expect(service.createBriefing("Summarize today")).rejects.toMatchObject({
      statusCode: 503,
      code: "AGENT_UNAVAILABLE",
      message: "The shop assistant could not complete the briefing. Please try again later.",
    });
    expect(deps.respond).toHaveBeenCalledTimes(1);
    expect(deps.reportService.getSummary).not.toHaveBeenCalled();
    await expect(service.createBriefing("Explain your scope")).resolves.toBeDefined();
  });

  it("does not send database failures to the model", async () => {
    const deps = createDependencies();
    deps.respond.mockResolvedValue(toolRequest);
    deps.reportService.getSummary.mockRejectedValue(new Error("mongodb://private-credentials"));
    await expect(
      createAdminAgentService(deps).createBriefing("Summarize today"),
    ).rejects.toMatchObject({ code: "AGENT_UNAVAILABLE" });
    expect(deps.respond).toHaveBeenCalledTimes(1);
  });

  it.each(["", " ", "x".repeat(501)])(
    "rejects invalid questions before paid requests",
    async (question) => {
      const deps = createDependencies();
      await expect(createAdminAgentService(deps).createBriefing(question)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(deps.respond).not.toHaveBeenCalled();
    },
  );
});
