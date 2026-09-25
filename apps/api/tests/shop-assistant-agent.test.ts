import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelResponse, Respond } from "../src/agents/openai-responses.js";
import { runShopAssistantAgent } from "../src/agents/shop-assistant-agent.js";
import type { ShopAssistantSnapshot } from "../src/agents/shop-assistant-summary.js";
import type { ShopMenuSnapshot } from "../src/agents/shop-menu-tool.js";

const message = (text: string): ModelResponse => ({
  status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text }] }],
});
const call = (name: string, args = "{}", id = name) => ({
  type: "function_call",
  name,
  arguments: args,
  call_id: id,
});
const request = (...output: ModelResponse["output"]): ModelResponse => ({
  status: "completed",
  output,
});
const report: ShopAssistantSnapshot = {
  generatedAt: "2026-09-13T07:00:00.000Z",
  timezone: "Asia/Kolkata",
  ordersCreatedToday: {
    total: 1,
    currentStatusCounts: {
      PLACED: 1,
      CONFIRMED: 0,
      PREPARING: 0,
      READY: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    },
  },
  ongoingOrders: {
    total: 1,
    statusCounts: { PLACED: 1, CONFIRMED: 0, PREPARING: 0, READY: 0 },
  },
  completedSalesUpdatedToday: {
    orderCount: 0,
    salesTotalPaise: 0,
    salesTotalFormatted: "₹0.00",
    itemsSold: 0,
  },
  completedSalesUpdatedThisMonth: {
    orderCount: 2,
    salesTotalPaise: 9000,
    salesTotalFormatted: "₹90.00",
    itemsSold: 2,
  },
  lowStock: { totalVariants: 0, listedVariants: [], listIsPartial: false },
};
const menu: ShopMenuSnapshot = {
  generatedAt: "2026-09-13T07:01:00.000Z",
  totalProducts: 1,
  listIsPartial: false,
  products: [
    {
      name: "Filter coffee",
      description: "Fresh milk coffee",
      isVegetarian: true,
      variants: [
        {
          name: "Regular",
          pricePaise: 4550,
          priceFormatted: "₹45.50",
          stockQuantity: 2,
          isAvailable: true,
        },
      ],
    },
  ],
};
const deps = () => ({
  respond: vi.fn<Respond>(),
  getShopSummary: vi.fn<() => Promise<ShopAssistantSnapshot>>().mockResolvedValue(report),
  getShopMenu: vi.fn<() => Promise<ShopMenuSnapshot>>().mockResolvedValue(menu),
  retrieveKnowledge: vi.fn().mockReturnValue([
    {
      id: "payment",
      title: "Payment",
      content: "Orders are paid at the shop, with no online payment.",
      keywords: ["pay"],
    },
  ]),
  now: () => new Date("2026-09-13T07:02:00.000Z"),
});

describe("shop assistant RAG and live tools", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retrieves question-specific notes before generation and answers policy questions without database reads", async () => {
    const d = deps();
    d.respond.mockResolvedValue(message("Pay at the shop. [K1]"));
    const result = await runShopAssistantAgent("  How do customers pay?  ", d);
    expect(d.retrieveKnowledge).toHaveBeenCalledExactlyOnceWith("How do customers pay?");
    const input = d.respond.mock.calls[0]?.[0].input;
    expect(input?.[0]).toEqual({ role: "user", content: "How do customers pay?" });
    expect(input?.[1]?.role).toBe("user");
    expect(String(input?.[1]?.content)).toContain("Orders are paid at the shop");
    expect(result.sources).toEqual([
      {
        id: "K1",
        title: "Payment",
        kind: "knowledge",
        excerpt: "Orders are paid at the shop, with no online payment.",
      },
    ]);
    expect(result.generatedAt).toBe("2026-09-13T07:02:00.000Z");
    expect(result.usedShopData).toBe(false);
    expect(d.respond).toHaveBeenCalledTimes(1);
    expect(d.getShopMenu).not.toHaveBeenCalled();
    expect(d.getShopSummary).not.toHaveBeenCalled();
  });

  it("answers a menu question with the live menu and its actual source", async () => {
    const d = deps();
    d.retrieveKnowledge.mockReturnValue([]);
    d.respond
      .mockResolvedValueOnce(request(call("get_shop_menu")))
      .mockResolvedValueOnce(message("Regular coffee costs ₹45.50; 2 are available. [M1]"));
    const result = await runShopAssistantAgent("What does coffee cost?", d);
    expect(d.getShopMenu).toHaveBeenCalledTimes(1);
    expect(d.getShopSummary).not.toHaveBeenCalled();
    // Round 2 may still act (for example, propose a change); here the model just answers.
    expect(d.respond.mock.calls[1]?.[0]).toMatchObject({ toolChoice: "auto" });
    expect(d.respond).toHaveBeenCalledTimes(2);
    expect(d.respond.mock.calls[1]?.[0].input).toContainEqual({
      type: "function_call_output",
      call_id: "get_shop_menu",
      output: JSON.stringify({ sourceId: "M1", data: menu }),
    });
    expect(result).toMatchObject({
      usedShopData: true,
      generatedAt: menu.generatedAt,
      sources: [{ id: "M1", kind: "menu" }],
    });
  });

  it("can combine retrieved notes, monthly reports and the menu within two model requests", async () => {
    const d = deps();
    const reasoning = { type: "reasoning", encrypted_content: "opaque-state" };
    d.respond
      .mockResolvedValueOnce(request(reasoning, call("get_shop_summary"), call("get_shop_menu")))
      .mockResolvedValueOnce(
        message(
          "Monthly completed sales are ₹90.00. [R1] Coffee costs ₹45.50. [M1] Pay at shop. [K1]",
        ),
      );
    const result = await runShopAssistantAgent(
      "Explain this month's sales, coffee prices and payment",
      d,
    );
    expect(d.respond).toHaveBeenCalledTimes(2);
    expect(d.getShopSummary).toHaveBeenCalledTimes(1);
    expect(d.getShopMenu).toHaveBeenCalledTimes(1);
    expect(d.respond.mock.calls[1]?.[0].input).toContainEqual(reasoning);
    expect(result.sources.map((s) => s.id)).toEqual(["K1", "R1", "M1"]);
    expect(result.generatedAt).toBe(menu.generatedAt);
    expect(d.respond.mock.calls[0]?.[0].signal).toBe(d.respond.mock.calls[1]?.[0].signal);
  });

  it("returns an honest no-source answer without inventing reference material", async () => {
    const d = deps();
    d.retrieveKnowledge.mockReturnValue([]);
    d.respond.mockResolvedValue(
      message("The shop's opening hours are not recorded. Please confirm them with the owner."),
    );
    const result = await runShopAssistantAgent("When does the shop open?", d);
    expect(result.sources).toEqual([]);
    expect(result.usedShopData).toBe(false);
    expect(d.getShopMenu).not.toHaveBeenCalled();
  });

  it.each([
    [call("delete_product")],
    [call("get_shop_menu", '{"query":{"$where":"bad"}}')],
    [call("get_shop_summary", "not-json")],
    [call("get_shop_menu"), call("get_shop_menu", "{}", "second")],
    [call("get_shop_menu", "{}", "same"), call("get_shop_summary", "{}", "same")],
    [call("get_shop_menu"), call("get_shop_summary"), call("get_shop_summary", "{}", "third")],
    [call("get_shop_summary"), call("unknown")],
  ])("rejects an invalid tool batch before any database reads: %j", async (...calls) => {
    const d = deps();
    d.respond.mockResolvedValue(request(...calls));
    await expect(runShopAssistantAgent("Check the shop", d)).rejects.toThrow();
    expect(d.getShopMenu).not.toHaveBeenCalled();
    expect(d.getShopSummary).not.toHaveBeenCalled();
    expect(d.respond).toHaveBeenCalledTimes(1);
  });

  it("reads each live tool at most once per question", async () => {
    const d = deps();
    d.respond.mockResolvedValue(request(call("get_shop_menu")));
    await expect(runShopAssistantAgent("Check menu", d)).rejects.toThrow("read once");
    expect(d.getShopMenu).toHaveBeenCalledTimes(1);
    expect(d.respond).toHaveBeenCalledTimes(2);
  });

  it("switches tools off after two rounds and rejects a third", async () => {
    const d = deps();
    d.respond
      .mockResolvedValueOnce(request(call("get_shop_menu")))
      .mockResolvedValueOnce(request(call("get_shop_summary")))
      .mockResolvedValueOnce(request(call("get_shop_summary", "{}", "again")));
    await expect(runShopAssistantAgent("Check everything", d)).rejects.toThrow(
      "exceeded the permitted tool rounds",
    );
    expect(d.respond.mock.calls.map(([request]) => request.toolChoice)).toEqual([
      "auto",
      "auto",
      "none",
    ]);
  });

  it("rejects fabricated source IDs", async () => {
    const d = deps();
    d.respond.mockResolvedValue(message("Coffee costs ₹50. [M1]"));
    await expect(runShopAssistantAgent("What does coffee cost?", d)).rejects.toThrow(
      "unavailable source",
    );
  });

  it("does not share database failures with the model or make a second paid call", async () => {
    const d = deps();
    d.respond.mockResolvedValue(request(call("get_shop_menu")));
    d.getShopMenu.mockRejectedValue(new Error("private database details"));
    await expect(runShopAssistantAgent("Check menu", d)).rejects.toThrow();
    expect(d.respond).toHaveBeenCalledTimes(1);
  });

  it.each(["get_shop_summary", "get_shop_menu"])(
    "stops a stalled %s read at the deadline without starting another tool or paid call",
    async (name) => {
      const controller = new AbortController();
      vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
      const removeListener = vi.spyOn(controller.signal, "removeEventListener");
      const d = deps();
      const firstTool = name === "get_shop_summary" ? d.getShopSummary : d.getShopMenu;
      const remainingTool = name === "get_shop_summary" ? d.getShopMenu : d.getShopSummary;
      firstTool.mockImplementation(() => new Promise<never>(() => undefined));
      d.respond.mockResolvedValue(
        request(
          call(name),
          call(name === "get_shop_summary" ? "get_shop_menu" : "get_shop_summary"),
        ),
      );

      const result = runShopAssistantAgent("Check the shop and menu", d);
      const timedOut = expect(result).rejects.toThrow("exceeded its time limit");
      await vi.waitFor(() => expect(firstTool).toHaveBeenCalledTimes(1));
      controller.abort();

      await timedOut;
      expect(remainingTool).not.toHaveBeenCalled();
      expect(d.respond).toHaveBeenCalledTimes(1);
      expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    },
  );

  it.each(["resolve", "reject"] as const)(
    "ignores a tool's late %s after timeout without resuming the model loop",
    async (outcome) => {
      const controller = new AbortController();
      vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
      const d = deps();
      let finishRead: () => void = () => undefined;
      d.getShopMenu.mockImplementation(
        () =>
          new Promise((resolve, reject) => {
            finishRead = () =>
              outcome === "resolve"
                ? resolve(menu)
                : reject(new Error("private database error after timeout"));
          }),
      );
      d.respond.mockResolvedValue(request(call("get_shop_menu")));

      const result = runShopAssistantAgent("Check menu", d);
      const timedOut = expect(result).rejects.toThrow("exceeded its time limit");
      await vi.waitFor(() => expect(d.getShopMenu).toHaveBeenCalledTimes(1));
      controller.abort();
      await timedOut;
      finishRead();
      await Promise.resolve();
      await Promise.resolve();

      expect(d.respond).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["success", "failure"] as const)(
    "removes the abort listener after normal tool %s",
    async (outcome) => {
      const controller = new AbortController();
      vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
      const addListener = vi.spyOn(controller.signal, "addEventListener");
      const removeListener = vi.spyOn(controller.signal, "removeEventListener");
      const d = deps();
      d.respond
        .mockResolvedValueOnce(request(call("get_shop_menu")))
        .mockResolvedValueOnce(message("The coffee menu is available. [M1]"));
      if (outcome === "failure")
        d.getShopMenu.mockRejectedValue(new Error("private database error"));

      const result = runShopAssistantAgent("Check menu", d);
      if (outcome === "failure") await expect(result).rejects.toThrow("private database error");
      else await expect(result).resolves.toMatchObject({ usedShopData: true });

      const listener = addListener.mock.calls.find(([event]) => event === "abort")?.[1];
      expect(listener).toBeTypeOf("function");
      expect(removeListener).toHaveBeenCalledWith("abort", listener);
    },
  );

  it.each(["", " ", "x".repeat(501)])(
    "validates questions before retrieval and paid calls",
    async (question) => {
      const d = deps();
      await expect(runShopAssistantAgent(question, d)).rejects.toThrow();
      expect(d.retrieveKnowledge).not.toHaveBeenCalled();
      expect(d.respond).not.toHaveBeenCalled();
    },
  );
});

describe("shop assistant change proposals", () => {
  const proposed = (id: string, summary: string) => ({
    status: "PROPOSED" as const,
    proposalId: id,
    summary,
    expiresAt: "2026-09-13T07:17:00.000Z",
    appliedNow: false as const,
  });
  const withProposals = () => ({
    ...deps(),
    proposeChange:
      vi.fn<NonNullable<Parameters<typeof runShopAssistantAgent>[1]["proposeChange"]>>(),
  });
  const stockArgs = JSON.stringify({
    productName: "Filter coffee",
    variantName: "Regular",
    mode: "add",
    quantity: 20,
  });

  it("records a proposal, tells the model nothing changed, and returns it for approval", async () => {
    const d = withProposals();
    d.retrieveKnowledge.mockReturnValue([]);
    d.proposeChange.mockResolvedValue(proposed("p1", "Filter coffee: Regular stock 2 → 22"));
    d.respond
      .mockResolvedValueOnce(request(call("propose_stock_update", stockArgs)))
      .mockResolvedValueOnce(message("I've prepared a restock for your approval: Regular 2 → 22."));

    const result = await runShopAssistantAgent("Add 20 regular filter coffee", d);

    expect(d.proposeChange).toHaveBeenCalledExactlyOnceWith({
      kind: "STOCK",
      productName: "Filter coffee",
      variantName: "Regular",
      mode: "add",
      quantity: 20,
    });
    const toolOutput = d.respond.mock.calls[1]?.[0].input.find(
      (item) => item.type === "function_call_output",
    );
    expect(JSON.parse(String(toolOutput?.output))).toMatchObject({
      status: "PROPOSED",
      appliedNow: false,
    });
    expect(result.proposals).toEqual([
      {
        id: "p1",
        summary: "Filter coffee: Regular stock 2 → 22",
        expiresAt: "2026-09-13T07:17:00.000Z",
      },
    ]);
  });

  it("reads the menu first, then proposes in the second round", async () => {
    const d = withProposals();
    d.retrieveKnowledge.mockReturnValue([]);
    d.proposeChange.mockResolvedValue(
      proposed("p1", "Filter coffee: Regular unavailable → available"),
    );
    d.respond
      .mockResolvedValueOnce(request(call("get_shop_menu")))
      .mockResolvedValueOnce(
        request(
          call(
            "propose_availability_change",
            JSON.stringify({
              productName: "Filter coffee",
              variantName: "Regular",
              isAvailable: true,
            }),
          ),
        ),
      )
      .mockResolvedValueOnce(message("I've prepared this change for your approval. [M1]"));

    const result = await runShopAssistantAgent("Mark Filter Coffee Regular available", d);

    expect(d.getShopMenu).toHaveBeenCalledTimes(1);
    expect(d.proposeChange).toHaveBeenCalledExactlyOnceWith({
      kind: "AVAILABILITY",
      productName: "Filter coffee",
      variantName: "Regular",
      isAvailable: true,
    });
    expect(d.respond.mock.calls.map(([request]) => request.toolChoice)).toEqual([
      "auto",
      "auto",
      "none",
    ]);
    expect(result.proposals).toHaveLength(1);
    expect(result.sources).toContainEqual(expect.objectContaining({ id: "M1" }));
  });

  it("counts the proposal limit across both rounds", async () => {
    const d = withProposals();
    d.proposeChange.mockResolvedValue(proposed("p", "change"));
    d.respond
      .mockResolvedValueOnce(
        request(...["a", "b"].map((id) => call("propose_stock_update", stockArgs, id))),
      )
      .mockResolvedValueOnce(
        request(...["c", "d"].map((id) => call("propose_stock_update", stockArgs, id))),
      );

    await expect(runShopAssistantAgent("Restock everything", d)).rejects.toThrow(
      "At most 3 changes",
    );
    expect(d.proposeChange).toHaveBeenCalledTimes(2);
  });

  it("reports invalid values back to the model instead of failing the answer", async () => {
    const d = withProposals();
    d.respond
      .mockResolvedValueOnce(
        request(
          call(
            "propose_stock_update",
            JSON.stringify({ productName: "X", variantName: null, mode: "set", quantity: 50_000 }),
          ),
        ),
      )
      .mockResolvedValueOnce(message("That quantity is too large to propose."));

    const result = await runShopAssistantAgent("Set stock to 50000", d);

    expect(d.proposeChange).not.toHaveBeenCalled();
    const toolOutput = d.respond.mock.calls[1]?.[0].input.find(
      (item) => item.type === "function_call_output",
    );
    expect(JSON.parse(String(toolOutput?.output))).toMatchObject({ status: "NOT_PROPOSED" });
    expect(result.proposals).toEqual([]);
  });

  it("limits proposals per run and validates the batch before any change is recorded", async () => {
    const d = withProposals();
    d.respond.mockResolvedValue(
      request(...["a", "b", "c", "d"].map((id) => call("propose_stock_update", stockArgs, id))),
    );

    await expect(runShopAssistantAgent("Restock everything", d)).rejects.toThrow(
      "At most 3 changes",
    );
    expect(d.proposeChange).not.toHaveBeenCalled();
  });

  it("fails safely when proposals are not available", async () => {
    const d = deps();
    d.respond.mockResolvedValue(request(call("propose_stock_update", stockArgs)));

    await expect(runShopAssistantAgent("Restock coffee", d)).rejects.toThrow(
      "Change proposals are not available",
    );
    expect(d.respond).toHaveBeenCalledTimes(1);
  });

  it("rejects an answer that claims the proposed change was applied", async () => {
    const d = withProposals();
    d.proposeChange.mockResolvedValue(proposed("p1", "Filter coffee: Regular stock 2 → 22"));
    d.respond
      .mockResolvedValueOnce(request(call("propose_stock_update", stockArgs)))
      .mockResolvedValueOnce(message("Done — I have restocked the regular filter coffee."));

    await expect(runShopAssistantAgent("Add 20 regular filter coffee", d)).rejects.toThrow(
      "unperformed shop change",
    );
  });
});
