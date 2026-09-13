import { describe, expect, it } from "vitest";

import { SHOP_KNOWLEDGE_DOCUMENTS, type KnowledgeDocument } from "../src/agents/shop-knowledge.js";
import { retrieveShopKnowledge } from "../src/agents/shop-knowledge-retrieval.js";

describe("shop knowledge retrieval", () => {
  it.each([
    ["How do customers place a take-away order?", "pickup-ordering"],
    ["How can I pay online with UPI?", "payment-at-shop"],
    ["How can customers check a pickup's progress?", "order-tracking"],
    ["Can a confirmed order be cancelled?", "order-status-stock"],
    ["How do I refill a sold-out item?", "product-management"],
    ["Can employees reset account passwords?", "staff-permissions"],
    ["Does the sales report tell me my profit?", "sales-report-semantics"],
    ["What does the low inventory threshold mean?", "low-stock-report-semantics"],
  ])("retrieves the relevant guidance for %j", (question, expectedId) => {
    expect(retrieveShopKnowledge(question)[0]?.id).toBe(expectedId);
  });

  it.each([
    ["What time do you open on Sunday?", "unconfirmed-shop-details"],
    ["What is the shop address and contact phone number?", "unconfirmed-shop-details"],
    ["What is the refund policy?", "unconfirmed-refunds-allergens"],
    ["Is the coffee safe for someone with a milk allergy?", "unconfirmed-refunds-allergens"],
  ])("retrieves an explicit knowledge gap for %j", (question, expectedId) => {
    const result = retrieveShopKnowledge(question);
    expect(result[0]?.id).toBe(expectedId);
    expect(result[0]?.content).toContain("no confirmed");
  });

  it.each([
    "",
    "How do I?",
    "Tell me about the weather today.",
    "Write a poem about Jupiter.",
    "How do I debug Python code?",
  ])("returns no context for an empty or unmatched question %j", (question) => {
    expect(retrieveShopKnowledge(question)).toEqual([]);
  });

  it("retrieves at most four ranked chunks, excluding unrelated documents", () => {
    const result = retrieveShopKnowledge(
      "Explain checkout, payment, tracking, cancellation, product availability, and staff permissions.",
    );
    expect(result).toHaveLength(4);
    expect(result.map(({ id }) => id)).not.toContain("unconfirmed-shop-details");
    expect(new Set(result.map(({ id }) => id)).size).toBe(4);
  });

  it("searches the supplied corpus on every call, including updated content", () => {
    const documents: KnowledgeDocument[] = [
      {
        id: "owner-note",
        title: "Pickup instructions",
        content: "Use the front counter for pickup.",
        keywords: ["pickup"],
      },
    ];
    expect(retrieveShopKnowledge("pickup", documents)[0]?.content).toContain("front counter");

    documents[0]!.content = "Use the side counter for pickup.";
    expect(retrieveShopKnowledge("pickup", documents)[0]?.content).toContain("side counter");
    expect(retrieveShopKnowledge("refund", documents)).toEqual([]);
    expect(retrieveShopKnowledge("pickup", [])).toEqual([]);
  });

  it("ranks meaningful title and keyword matches above incidental content matches", () => {
    const documents: KnowledgeDocument[] = [
      { id: "incidental", title: "Other", content: "Payment happens later.", keywords: [] },
      { id: "title", title: "Payment", content: "Details.", keywords: [] },
      { id: "keyword", title: "Counter", content: "Details.", keywords: ["payment"] },
    ];
    expect(retrieveShopKnowledge("payment", documents).map(({ id }) => id)).toEqual([
      "keyword",
      "title",
    ]);
    expect(documents.map(({ id }) => id)).toEqual(["incidental", "title", "keyword"]);
  });

  it("normalizes punctuation and repeated words without inflating their weight", () => {
    const question = "How do I restock a sold-out product?";
    expect(retrieveShopKnowledge("RESTOCK!!! sold-out product product product")).toEqual(
      retrieveShopKnowledge(question),
    );
  });

  it("keeps stable, unique source IDs for citations", () => {
    expect(new Set(SHOP_KNOWLEDGE_DOCUMENTS.map(({ id }) => id)).size).toBe(
      SHOP_KNOWLEDGE_DOCUMENTS.length,
    );
    expect(
      SHOP_KNOWLEDGE_DOCUMENTS.every(
        ({ id, title, content, keywords }) => id && title && content && keywords.length > 0,
      ),
    ).toBe(true);
  });
});
