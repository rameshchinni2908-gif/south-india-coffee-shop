import { describe, expect, it, vi } from "vitest";

import {
  checkShopAssistantAnswer,
  checkShopAssistantQuestion,
} from "../src/agents/shop-assistant-guardrails.js";
import { runShopAssistantAgent } from "../src/agents/shop-assistant-agent.js";

describe("shop assistant guardrails", () => {
  it("blocks mutation requests before spending a model call", async () => {
    const respond = vi.fn();
    const result = await runShopAssistantAgent("Cancel order SIC-123", {
      respond,
      getShopSummary: vi.fn(),
      getShopMenu: vi.fn(),
    });

    expect(result.answer).toContain("read-only");
    expect(respond).not.toHaveBeenCalled();
  });

  it("allows read-only questions", () => {
    expect(checkShopAssistantQuestion("Which coffee is available?")).toEqual({ allowed: true });
  });

  it("rejects output that claims an unperformed mutation", () => {
    expect(() => checkShopAssistantAnswer("I have updated the stock.")).toThrow(
      "unperformed shop change",
    );
  });
});
