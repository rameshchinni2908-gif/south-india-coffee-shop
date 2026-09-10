import { describe, expect, it, vi } from "vitest";

import { runAdminBriefAgent } from "../src/agents/admin-brief-agent.js";
import type { ModelResponse, Respond } from "../src/agents/openai-responses.js";
import type { ShopSnapshot } from "../src/agents/shop-summary-tool.js";

const snapshot: ShopSnapshot = {
  generatedAt: "2026-09-09T08:00:00.000Z",
  timezone: "Asia/Kolkata",
  ordersCreatedToday: {
    total: 2,
    currentStatusCounts: {
      PLACED: 1,
      CONFIRMED: 0,
      PREPARING: 0,
      READY: 0,
      COMPLETED: 1,
      CANCELLED: 0,
    },
  },
  completedSalesUpdatedToday: {
    orderCount: 1,
    salesTotalPaise: 4550,
    salesTotalFormatted: "₹45.50",
    itemsSold: 1,
  },
  lowStock: { totalVariants: 0, listedVariants: [], listIsPartial: false },
};
const toolCall = (overrides: Record<string, unknown> = {}) => ({
  type: "function_call",
  name: "get_shop_summary",
  arguments: "{}",
  call_id: "call_summary_1",
  ...overrides,
});
const response = (...output: ModelResponse["output"]): ModelResponse => ({
  status: "completed",
  output,
});
const answer = (text = "One completed order: ₹45.50.") =>
  response({
    type: "message",
    content: [{ type: "output_text", text }],
  });
const dependencies = () => ({
  respond: vi.fn<Respond>(),
  getShopSummary: vi.fn<() => Promise<ShopSnapshot>>().mockResolvedValue(snapshot),
  trace: vi.fn<(message: string) => void>(),
});

describe("admin briefing agent", () => {
  it("executes one allowlisted read and connects its result to the preserved model output", async () => {
    const deps = dependencies();
    const reasoning = {
      type: "reasoning",
      id: "reason_1",
      encrypted_content: "opaque-state",
      summary: [],
    };
    const call = toolCall();
    deps.respond.mockResolvedValueOnce(response(reasoning, call)).mockResolvedValueOnce(answer());

    expect(await runAdminBriefAgent("  What needs attention today?  ", deps)).toEqual({
      answer: "One completed order: ₹45.50.",
      usedShopData: true,
    });
    expect(deps.getShopSummary).toHaveBeenCalledTimes(1);
    expect(deps.respond).toHaveBeenCalledTimes(2);
    expect(deps.respond.mock.calls[0]?.[0].toolChoice).toBe("auto");
    expect(deps.respond.mock.calls[1]?.[0]).toEqual({
      toolChoice: "none",
      input: [
        { role: "user", content: "What needs attention today?" },
        reasoning,
        call,
        {
          type: "function_call_output",
          call_id: "call_summary_1",
          output: JSON.stringify(snapshot),
        },
      ],
    });
    expect(deps.trace).toHaveBeenCalledWith(expect.stringContaining("records were not changed"));
  });

  it("labels a no-tool answer as scope-only without logging into the shop", async () => {
    const deps = dependencies();
    deps.respond.mockResolvedValueOnce(answer("I can only summarize today's shop report."));
    expect(await runAdminBriefAgent("Write a poem", deps)).toEqual({
      answer: "I can only summarize today's shop report.",
      usedShopData: false,
    });
    expect(deps.respond).toHaveBeenCalledTimes(1);
    expect(deps.getShopSummary).not.toHaveBeenCalled();
    expect(deps.trace).toHaveBeenCalledWith(expect.stringContaining("scope explanation only"));
  });

  it.each([
    ["unknown tool", [toolCall({ name: "update_stock" })], "not permitted"],
    ["missing call id", [toolCall({ call_id: "" })], "not permitted"],
    ["malformed JSON", [toolCall({ arguments: "{" })], "invalid tool arguments"],
    [
      "extra arguments",
      [toolCall({ arguments: '{"path":"/api/admin/orders"}' })],
      "does not accept arguments",
    ],
    ["null arguments", [toolCall({ arguments: "null" })], "does not accept arguments"],
    ["array arguments", [toolCall({ arguments: "[]" })], "does not accept arguments"],
    ["multiple calls", [toolCall(), toolCall({ call_id: "call_summary_2" })], "only one tool call"],
  ])("rejects %s before calling the shop", async (_label, calls, message) => {
    const deps = dependencies();
    deps.respond.mockResolvedValueOnce(response(...calls));
    await expect(runAdminBriefAgent("Summarize today", deps)).rejects.toThrow(message);
    expect(deps.getShopSummary).not.toHaveBeenCalled();
    expect(deps.respond).toHaveBeenCalledTimes(1);
  });

  it("stops after the second model request even if the model asks for another tool", async () => {
    const deps = dependencies();
    deps.respond
      .mockResolvedValueOnce(response(toolCall()))
      .mockResolvedValueOnce(response(toolCall()));
    await expect(runAdminBriefAgent("Summarize today", deps)).rejects.toThrow("one-tool limit");
    expect(deps.respond).toHaveBeenCalledTimes(2);
    expect(deps.getShopSummary).toHaveBeenCalledTimes(1);
  });

  it("does not send a failed shop read to the model or claim a completed briefing", async () => {
    const deps = dependencies();
    deps.respond.mockResolvedValueOnce(response(toolCall()));
    deps.getShopSummary.mockRejectedValueOnce(new Error("Shop report failed (HTTP 401)."));
    await expect(runAdminBriefAgent("Summarize today", deps)).rejects.toThrow("HTTP 401");
    expect(deps.respond).toHaveBeenCalledTimes(1);
    expect(deps.trace).not.toHaveBeenCalledWith(expect.stringContaining("Briefing received"));
  });

  it("stops when the first model request fails", async () => {
    const deps = dependencies();
    deps.respond.mockRejectedValueOnce(new Error("OpenAI request failed (HTTP 429)."));
    await expect(runAdminBriefAgent("Summarize today", deps)).rejects.toThrow("HTTP 429");
    expect(deps.getShopSummary).not.toHaveBeenCalled();
    expect(deps.respond).toHaveBeenCalledTimes(1);
  });

  it.each(["", "   ", "x".repeat(501)])(
    "rejects invalid questions before external calls",
    async (question) => {
      const deps = dependencies();
      await expect(runAdminBriefAgent(question, deps)).rejects.toThrow(
        "between 1 and 500 characters",
      );
      expect(deps.respond).not.toHaveBeenCalled();
      expect(deps.getShopSummary).not.toHaveBeenCalled();
    },
  );

  it("does not turn missing text into a successful answer", async () => {
    const deps = dependencies();
    deps.respond.mockResolvedValueOnce(response({ type: "reasoning", summary: [] }));
    await expect(runAdminBriefAgent("Explain your scope", deps)).rejects.toThrow("text answer");
  });
});
