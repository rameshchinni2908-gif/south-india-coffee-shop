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

    expect(result.answer).toContain("cannot change orders");
    expect(respond).not.toHaveBeenCalled();
  });

  it("allows read-only questions", () => {
    expect(checkShopAssistantQuestion("Which coffee is available?")).toEqual({ allowed: true });
  });

  it.each([
    "How do staff cancel a confirmed order?",
    "How does a customer place a pickup order?",
    "Who is allowed to archive a product?",
  ])("answers how-to questions instead of refusing them (%s)", (question) => {
    expect(checkShopAssistantQuestion(question)).toEqual({ allowed: true });
  });

  it.each([
    "Add 20 units of stock to medu vada",
    "Set the large filter coffee to sold out",
    "Mark masala dosa as available again",
  ])("lets stock and availability requests through to become proposals (%s)", (question) => {
    expect(checkShopAssistantQuestion(question)).toEqual({ allowed: true });
  });

  it.each([
    "Cancel order 1042 for me.",
    "Please mark order 1042 as ready.",
    "Change the price of filter coffee to ₹40.",
    "Reset the password for the counter staff account.",
    "Delete the masala tea product.",
    "Add a new product called cold coffee",
  ])("still refuses changes it cannot propose (%s)", (question) => {
    expect(checkShopAssistantQuestion(question)).toMatchObject({ allowed: false });
  });

  it.each(["I have updated the stock.", "I have marked it sold out.", "We have restocked it."])(
    "rejects output that claims an unperformed mutation (%s)",
    (answer) => {
      expect(() => checkShopAssistantAnswer(answer)).toThrow("unperformed shop change");
    },
  );

  it("accepts an answer that describes a pending proposal", () => {
    expect(
      checkShopAssistantAnswer("I've prepared a change for you to approve: Medu Vada → 40."),
    ).toContain("prepared");
  });
});
