import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelResponse, Respond } from "../src/agents/openai-responses.js";
import type { AgentRunRepository } from "../src/repositories/agent-run-repository.js";
import { createAdminAgentService } from "../src/services/admin-agent-service.js";
import type { ReportService } from "../src/services/report-service.js";
import type { ProductService } from "../src/services/product-service.js";
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
  productService: { listPublic: vi.fn<ProductService["listPublic"]>() },
  respond: vi.fn<Respond>(),
  now: () => new Date("2026-09-10T08:01:00.000Z"),
});

describe("production admin agent service", () => {
  afterEach(() => vi.restoreAllMocks());

  it("runs the real tool loop against the report service and sends only the allowed projection", async () => {
    const deps = createDependencies();
    deps.respond.mockResolvedValueOnce(toolRequest).mockResolvedValueOnce(modelAnswer);
    const service = createAdminAgentService(deps);

    expect(service.getStatus()).toEqual({ enabled: true });
    expect(await service.createBriefing("  What is low on stock?  ", "admin-1")).toMatchObject({
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
      sourceId: "R1",
      data: {
        generatedAt: "2026-09-10T08:00:00.000Z",
        completedSalesUpdatedToday: { salesTotalPaise: 4550, salesTotalFormatted: "₹45.50" },
        completedSalesUpdatedThisMonth: { salesTotalPaise: 90000, salesTotalFormatted: "₹900.00" },
        lowStock: {
          listedVariants: [
            { productName: "Coffee powder", variantName: "Regular", stockQuantity: 5 },
          ],
        },
      },
    });
    expect(sent).not.toMatch(/private|Private Staff|recentPriceChanges|sku/);
    expect(deps.productService.listPublic).not.toHaveBeenCalled();
  });

  it("keeps the API available without a configured model and performs no report reads", async () => {
    const deps = createDependencies();
    const service = createAdminAgentService({
      reportService: deps.reportService,
      productService: deps.productService,
    });
    expect(service.getStatus()).toEqual({ enabled: false });
    await expect(service.createBriefing("Summarize today", "admin-1")).rejects.toMatchObject({
      statusCode: 503,
      code: "AGENT_NOT_CONFIGURED",
    });
    expect(deps.reportService.getSummary).not.toHaveBeenCalled();
  });

  it("dates scope-only responses at generation time without reading the database", async () => {
    const deps = createDependencies();
    deps.respond.mockResolvedValue(modelAnswer);
    expect(
      await createAdminAgentService(deps).createBriefing("Explain your scope", "admin-1"),
    ).toMatchObject({
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
    const first = service.createBriefing("First question", "admin-1");
    await expect(service.createBriefing("Second question", "admin-1")).rejects.toMatchObject({
      statusCode: 429,
      code: "AGENT_BUSY",
    });
    expect(deps.respond).toHaveBeenCalledTimes(1);
    finish(modelAnswer);
    await first;
    await expect(service.createBriefing("Third question", "admin-1")).resolves.toMatchObject({
      usedShopData: false,
    });
  });

  it("replaces provider failures with a safe error, never retries, and releases the guard", async () => {
    const deps = createDependencies();
    deps.respond
      .mockRejectedValueOnce(new Error("secret-key private provider body"))
      .mockResolvedValue(modelAnswer);
    const service = createAdminAgentService(deps);
    await expect(service.createBriefing("Summarize today", "admin-1")).rejects.toMatchObject({
      statusCode: 503,
      code: "AGENT_UNAVAILABLE",
      message: "The shop assistant could not complete the briefing. Please try again later.",
    });
    expect(deps.respond).toHaveBeenCalledTimes(1);
    expect(deps.reportService.getSummary).not.toHaveBeenCalled();
    await expect(service.createBriefing("Explain your scope", "admin-1")).resolves.toBeDefined();
  });

  it("does not send database failures to the model", async () => {
    const deps = createDependencies();
    deps.respond.mockResolvedValue(toolRequest);
    deps.reportService.getSummary.mockRejectedValue(new Error("mongodb://private-credentials"));
    await expect(
      createAdminAgentService(deps).createBriefing("Summarize today", "admin-1"),
    ).rejects.toMatchObject({ code: "AGENT_UNAVAILABLE" });
    expect(deps.respond).toHaveBeenCalledTimes(1);
  });

  it("releases the global briefing guard when a database read exceeds the time limit", async () => {
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(new AbortController().signal)
      .mockReturnValueOnce(controller.signal);
    const deps = createDependencies();
    deps.reportService.getSummary.mockImplementation(() => new Promise(() => undefined));
    deps.respond.mockResolvedValueOnce(toolRequest).mockResolvedValue(modelAnswer);
    const service = createAdminAgentService(deps);

    const first = service.createBriefing("Summarize today", "admin-1");
    const timedOut = expect(first).rejects.toMatchObject({
      statusCode: 503,
      code: "AGENT_UNAVAILABLE",
      message: "The shop assistant could not complete the briefing. Please try again later.",
    });
    await vi.waitFor(() => expect(deps.reportService.getSummary).toHaveBeenCalledTimes(1));
    expect(timeout).toHaveBeenCalledWith(90_000);
    controller.abort(new Error("private abort reason"));

    await timedOut;
    expect(deps.respond).toHaveBeenCalledTimes(1);
    await expect(service.createBriefing("Explain your scope", "admin-1")).resolves.toMatchObject({
      usedShopData: false,
    });
    expect(deps.respond).toHaveBeenCalledTimes(2);
    expect(deps.reportService.getSummary).toHaveBeenCalledTimes(1);
  });

  it.each(["", " ", "x".repeat(501)])(
    "rejects invalid questions before paid requests",
    async (question) => {
      const deps = createDependencies();
      await expect(
        createAdminAgentService(deps).createBriefing(question, "admin-1"),
      ).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(deps.respond).not.toHaveBeenCalled();
    },
  );

  describe("agent run log", () => {
    const createRunLog = () => ({
      create: vi.fn<AgentRunRepository["create"]>().mockResolvedValue("run-1"),
      list: vi.fn<AgentRunRepository["list"]>().mockResolvedValue([]),
      setFeedback: vi.fn<AgentRunRepository["setFeedback"]>(),
    });
    const createClock = (...readings: number[]) => {
      const values = [...readings];
      return () => values.shift() ?? readings.at(-1) ?? 0;
    };

    it("records retrieval, tool, model and token details for an answered run", async () => {
      const deps = createDependencies();
      const runLog = createRunLog();
      deps.respond
        .mockResolvedValueOnce({ ...toolRequest, usage: { input_tokens: 900, output_tokens: 20 } })
        .mockResolvedValueOnce({
          ...modelAnswer,
          usage: { input_tokens: 1200, output_tokens: 60 },
        });
      const service = createAdminAgentService({
        ...deps,
        agentRunRepository: runLog,
        model: "test-model",
        // run start, retrieval start/end, model 1 start/end, tool start/end, model 2 start/end, run end
        elapsed: createClock(0, 0, 5, 10, 510, 520, 560, 570, 1270, 1300),
      });

      const briefing = await service.createBriefing("What is low on stock?", "admin-1");

      expect(briefing.runId).toBe("run-1");
      expect(runLog.create).toHaveBeenCalledTimes(1);
      const saved = runLog.create.mock.calls[0]![0];
      expect(saved).toMatchObject({
        adminId: "admin-1",
        question: "What is low on stock?",
        outcome: "ANSWERED",
        answer: "Coffee powder — Regular is at 5.",
        failureReason: null,
        sourceIds: expect.arrayContaining(["R1"]),
        model: "test-model",
        totalDurationMs: 1300,
        inputTokens: 2100,
        outputTokens: 80,
        createdAt: new Date("2026-09-10T08:01:00.000Z"),
      });
      expect(saved.trace.retrievedKnowledge.map(({ id }) => id)).toContain(
        "low-stock-report-semantics",
      );
      // Without an embedder the default retriever is keyword-only and says why.
      expect(saved.trace.retrieval).toEqual({
        mode: "keyword",
        durationMs: 5,
        embeddingTokens: 0,
        fallbackReason: "Embeddings are not configured.",
      });
      expect(saved.trace.modelCalls).toEqual([
        {
          durationMs: 500,
          ok: true,
          inputTokens: 900,
          outputTokens: 20,
          requestedTools: ["get_shop_summary"],
        },
        { durationMs: 700, ok: true, inputTokens: 1200, outputTokens: 60, requestedTools: [] },
      ]);
      expect(saved.trace.toolCalls).toEqual([
        { name: "get_shop_summary", durationMs: 40, ok: true },
      ]);
    });

    it("records guardrail refusals as blocked runs without a model request", async () => {
      const deps = createDependencies();
      const runLog = createRunLog();
      const service = createAdminAgentService({ ...deps, agentRunRepository: runLog });

      await service.createBriefing("Please cancel order 42", "admin-1");

      expect(deps.respond).not.toHaveBeenCalled();
      expect(runLog.create.mock.calls[0]![0]).toMatchObject({
        outcome: "BLOCKED",
        inputTokens: 0,
        trace: { modelCalls: [], toolCalls: [] },
      });
    });

    it("records failures without storing raw tool errors", async () => {
      const deps = createDependencies();
      const runLog = createRunLog();
      deps.reportService.getSummary.mockRejectedValue(new Error("mongodb://private-host secret"));
      deps.respond.mockResolvedValueOnce(toolRequest);
      const service = createAdminAgentService({ ...deps, agentRunRepository: runLog });

      await expect(service.createBriefing("Summarize today", "admin-1")).rejects.toMatchObject({
        code: "AGENT_UNAVAILABLE",
      });

      const saved = runLog.create.mock.calls[0]![0];
      expect(saved).toMatchObject({
        outcome: "FAILED",
        answer: null,
        failureReason: "A live shop tool failed.",
      });
      expect(saved.trace.toolCalls).toEqual([
        expect.objectContaining({ name: "get_shop_summary", ok: false }),
      ]);
      expect(JSON.stringify(saved)).not.toMatch(/private-host|secret/);
    });

    it("still returns the answer when saving the run fails", async () => {
      const deps = createDependencies();
      const runLog = createRunLog();
      runLog.create.mockRejectedValue(new Error("database down"));
      deps.respond.mockResolvedValue(modelAnswer);
      const service = createAdminAgentService({ ...deps, agentRunRepository: runLog });

      const briefing = await service.createBriefing("Explain your scope", "admin-1");

      expect(briefing.answer).toBe("Coffee powder — Regular is at 5.");
      expect(briefing).not.toHaveProperty("runId");
    });

    it("lets only the asking admin rate a run", async () => {
      const runLog = createRunLog();
      runLog.setFeedback.mockResolvedValue(null);
      const service = createAdminAgentService({
        ...createDependencies(),
        agentRunRepository: runLog,
      });

      await expect(
        service.rateRun("64b000000000000000000001", "admin-2", { rating: "DOWN", comment: null }),
      ).rejects.toMatchObject({ statusCode: 404, code: "AGENT_RUN_NOT_FOUND" });
      expect(runLog.setFeedback).toHaveBeenCalledWith("64b000000000000000000001", "admin-2", {
        rating: "DOWN",
        comment: null,
        ratedAt: new Date("2026-09-10T08:01:00.000Z"),
      });
    });

    it("reports a missing run log instead of pretending there are no runs", async () => {
      const service = createAdminAgentService(createDependencies());
      await expect(service.listRuns({ limit: 10 })).rejects.toMatchObject({
        statusCode: 503,
        code: "AGENT_RUN_LOG_NOT_CONFIGURED",
      });
    });
  });
});
