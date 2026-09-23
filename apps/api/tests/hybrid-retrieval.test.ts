import { describe, expect, it, vi } from "vitest";

import {
  cosineSimilarity,
  createHybridRetriever,
  fuseRankings,
  searchVectorsInMemory,
  type KnowledgeCandidate,
} from "../src/agents/hybrid-retrieval.js";
import type { Embed } from "../src/agents/openai-embeddings.js";
import { retrieveShopKnowledge } from "../src/agents/shop-knowledge-retrieval.js";
import { SHOP_KNOWLEDGE_DOCUMENTS } from "../src/agents/shop-knowledge.js";

const note = (
  id: string,
  embedding: number[] | null,
  fields: Partial<KnowledgeCandidate> = {},
): KnowledgeCandidate => ({
  id,
  title: id,
  content: `${id} content`,
  keywords: [],
  embedding,
  ...fields,
});
const embedAs =
  (vector: number[], tokens = 3): Embed =>
  async () => ({ vectors: [vector], tokens });

describe("vector maths", () => {
  it("measures direction, not length", () => {
    expect(cosineSimilarity([1, 0], [5, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 3])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1);
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
  });

  it("searches only notes that have an embedding, best first", async () => {
    const matches = await searchVectorsInMemory(
      [1, 0],
      [note("far", [0, 1]), note("none", null), note("near", [1, 0.1])],
      5,
    );
    expect(matches.map(({ id }) => id)).toEqual(["near", "far"]);
  });

  it("fuses rankings by position and rewards agreement", () => {
    const scores = fuseRankings([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(scores.get("a")).toBeCloseTo(1 / 61);
    expect(scores.get("b")).toBeCloseTo(1 / 62 + 1 / 61);
    expect(scores.get("c")).toBeCloseTo(1 / 62);
    expect([...scores.entries()].sort((l, r) => r[1] - l[1])[0]![0]).toBe("b");
  });
});

describe("hybrid retriever", () => {
  it("behaves exactly like the original keyword retriever without embeddings", async () => {
    const retrieve = createHybridRetriever({
      loadCandidates: async () =>
        SHOP_KNOWLEDGE_DOCUMENTS.map((document) => ({ ...document, embedding: null })),
    });
    for (const question of ["How does pickup work?", "What is our refund policy?", "hello"]) {
      const result = await retrieve(question);
      expect(result.mode).toBe("keyword");
      expect(result.fallbackReason).toBe("Embeddings are not configured.");
      expect(result.documents.map(({ document }) => document.id)).toEqual(
        retrieveShopKnowledge(question).map(({ id }) => id),
      );
    }
  });

  it("finds a paraphrase that shares no keywords with the note", async () => {
    const retrieve = createHybridRetriever({
      loadCandidates: async () => [
        note("opening-hours", [1, 0], { keywords: ["hours", "opening"] }),
        note("payment", [0, 1], { keywords: ["payment", "upi"] }),
      ],
      embed: embedAs([0.9, 0.1]),
    });

    const result = await retrieve("When do you unlock the doors?");

    expect(result.mode).toBe("hybrid");
    expect(result.embeddingTokens).toBe(3);
    expect(result.documents[0]).toMatchObject({
      document: { id: "opening-hours" },
      keyword: null,
      vector: { rank: 1 },
    });
    // The retriever returns plain documents; vectors never reach the model.
    expect(result.documents[0]!.document).not.toHaveProperty("embedding");
  });

  it("ranks a note both methods agree on above notes only one method found", async () => {
    const retrieve = createHybridRetriever({
      loadCandidates: async () => [
        note("keyword-only", [0, 1], { keywords: ["refund"] }),
        note("both", [1, 0], { keywords: ["refund"], title: "Refund policy" }),
        note("vector-only", [0.95, 0.3]),
      ],
      embed: embedAs([1, 0]),
    });

    const result = await retrieve("refund policy");

    expect(result.documents.map(({ document }) => document.id)).toEqual([
      "both",
      "keyword-only",
      "vector-only",
    ]);
    expect(result.documents[0]).toMatchObject({ keyword: { rank: 1 }, vector: { rank: 1 } });
  });

  it("drops vector matches below the similarity threshold and caps the result count", async () => {
    const candidates = Array.from({ length: 6 }, (_, index) =>
      note(`near-${index}`, [1, index * 0.01]),
    );
    const retrieve = createHybridRetriever({
      loadCandidates: async () => [...candidates, note("unrelated", [-1, 0.2])],
      embed: embedAs([1, 0]),
      minSimilarity: 0.5,
    });

    const result = await retrieve("anything");

    expect(result.documents).toHaveLength(4);
    expect(result.documents.map(({ document }) => document.id)).not.toContain("unrelated");
  });

  it("falls back to keywords when embedding the question fails", async () => {
    const retrieve = createHybridRetriever({
      loadCandidates: async () => [note("payment", [1, 0], { keywords: ["payment"] })],
      embed: vi.fn<Embed>().mockRejectedValue(new Error("private provider detail")),
    });

    const result = await retrieve("payment");

    expect(result).toMatchObject({
      mode: "keyword",
      fallbackReason: "Vector search failed; keyword results were used.",
      documents: [{ document: { id: "payment" }, vector: null }],
    });
  });

  it("ignores vector matches for notes that are not candidates", async () => {
    const retrieve = createHybridRetriever({
      loadCandidates: async () => [note("active", [1, 0])],
      embed: embedAs([1, 0]),
      searchVectors: async () => [
        { id: "archived", similarity: 0.99 },
        { id: "active", similarity: 0.9 },
      ],
    });

    const result = await retrieve("question");

    expect(result.documents.map(({ document }) => document.id)).toEqual(["active"]);
  });
});
