import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { loadEvalCases, evalCaseSchema, type EvalCase } from "../evals/dataset.js";
import type { Judge } from "../evals/judge.js";
import { runLiveCase } from "../evals/live-eval.js";
import { createEmbeddingCache } from "../evals/embedding-cache.js";
import { evaluateGuardrail, evaluateRetrieval } from "../evals/offline-metrics.js";
import {
  createSemanticRetrievers,
  evalEmbeddingSettings,
  textsToEmbed,
} from "../evals/retrievers.js";
import type { ModelResponse, Respond } from "../src/agents/openai-responses.js";

const baseline = JSON.parse(
  readFileSync(new URL("../evals/baseline.json", import.meta.url), "utf8"),
) as { offline: Record<string, number> };
const evalCase = (fields: Partial<EvalCase> & Pick<EvalCase, "id" | "question">) =>
  evalCaseSchema.parse(fields);
const answer = (text: string): ModelResponse => ({
  status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text }] }],
});

describe("shop assistant eval dataset", () => {
  it("loads valid, uniquely named cases covering every behaviour we grade", () => {
    const cases = loadEvalCases();
    expect(cases.length).toBeGreaterThanOrEqual(30);
    const tags = new Set(cases.flatMap(({ tags }) => tags));
    for (const tag of ["knowledge", "live", "guardrail", "unconfirmed", "injection", "scope"]) {
      expect(tags).toContain(tag);
    }
  });
});

describe("offline eval gate", () => {
  // These run in CI on every push. Raise evals/baseline.json when a change improves a score.
  const cases = loadEvalCases();

  it("keeps keyword retrieval at or above the committed baseline", async () => {
    const retrieval = await evaluateRetrieval(cases);
    expect(retrieval.recallAtK).toBeGreaterThanOrEqual(baseline.offline.retrievalRecallAtK!);
    expect(retrieval.hitRate).toBeGreaterThanOrEqual(baseline.offline.retrievalHitRate!);
    expect(retrieval.mrr).toBeGreaterThanOrEqual(baseline.offline.retrievalMrr!);
  });

  // Replays committed embeddings, so it is free and deterministic. It turns on once a hybrid
  // baseline is recorded with `npm run eval -- --refresh-embeddings --update-baseline`; after
  // that, adding a case or editing a built-in note requires refreshing the cache.
  it.skipIf(baseline.offline.hybridRecallAtK === undefined)(
    "keeps hybrid retrieval at or above the committed baseline",
    async () => {
      const cache = createEmbeddingCache(evalEmbeddingSettings());
      expect(
        cache.missing(textsToEmbed(cases)),
        "texts missing from evals/embeddings.cache.json; run npm run eval -- --refresh-embeddings",
      ).toEqual([]);
      const { hybrid } = await createSemanticRetrievers(cache.embed);
      const retrieval = await evaluateRetrieval(cases, hybrid);
      expect(retrieval.recallAtK).toBeGreaterThanOrEqual(baseline.offline.hybridRecallAtK!);
      expect(retrieval.hitRate).toBeGreaterThanOrEqual(baseline.offline.hybridHitRate!);
      expect(retrieval.mrr).toBeGreaterThanOrEqual(baseline.offline.hybridMrr!);
    },
  );

  it("keeps the question guardrail at or above the committed baseline", () => {
    const guardrail = evaluateGuardrail(cases);
    expect(guardrail.precision).toBeGreaterThanOrEqual(baseline.offline.guardrailPrecision!);
    expect(guardrail.recall).toBeGreaterThanOrEqual(baseline.offline.guardrailRecall!);
  });
});

describe("eval metrics", () => {
  it("computes recall, reciprocal rank, precision and off-topic noise", async () => {
    const report = await evaluateRetrieval(
      [
        evalCase({ id: "second", question: "q1", expectedKnowledgeIds: ["payment-at-shop"] }),
        evalCase({ id: "missed", question: "q2", expectedKnowledgeIds: ["order-tracking"] }),
        evalCase({ id: "ignored", question: "q3" }),
        evalCase({ id: "off-topic", question: "weather", tags: ["scope"] }),
      ],
      async (question) =>
        question === "q1"
          ? [
              { id: "pickup-ordering", score: 9 },
              { id: "payment-at-shop", score: 8 },
            ]
          : question === "weather"
            ? [{ id: "pickup-ordering", score: 1 }]
            : [],
    );

    expect(report.cases.map(({ id }) => id)).toEqual(["second", "missed"]);
    expect(report.cases[0]).toMatchObject({ recall: 1, reciprocalRank: 0.5, precision: 0.5 });
    expect(report.cases[1]).toMatchObject({ recall: 0, reciprocalRank: 0, precision: 0 });
    expect(report).toMatchObject({
      recallAtK: 0.5,
      hitRate: 0.5,
      mrr: 0.25,
      precisionAtK: 0.25,
      offTopicNotesPerQuestion: 1,
    });
  });

  it("separates wrongly blocked questions from missed change requests", () => {
    const report = evaluateGuardrail(
      [
        evalCase({ id: "tp", question: "block", shouldBlock: true }),
        evalCase({ id: "fn", question: "allow", shouldBlock: true }),
        evalCase({ id: "fp", question: "block" }),
        evalCase({ id: "tn", question: "allow" }),
      ],
      (question) => ({ allowed: question === "allow" }),
    );

    expect(report).toMatchObject({
      truePositives: ["tp"],
      falsePositives: ["fp"],
      falseNegatives: ["fn"],
      trueNegatives: 1,
      precision: 0.5,
      recall: 0.5,
    });
  });
});

describe("live eval runner", () => {
  const judge = vi.fn<Judge>();

  it("passes a grounded, cited answer that used the expected tool", async () => {
    const respond = vi
      .fn<Respond>()
      .mockResolvedValueOnce({
        status: "completed",
        output: [
          { type: "function_call", name: "get_shop_menu", arguments: "{}", call_id: "call_menu" },
        ],
      })
      .mockResolvedValueOnce(answer("Large filter coffee is sold out [M1]."));
    judge.mockResolvedValueOnce({
      score: 5,
      unsupportedClaims: [],
      reason: "Supported by M1.",
      inputTokens: 10,
      outputTokens: 5,
    });

    const result = await runLiveCase(
      evalCase({
        id: "sold-out",
        question: "Can customers order a Large filter coffee?",
        expectedTools: ["get_shop_menu"],
        mustMention: ["sold out"],
      }),
      { respond, judge },
    );

    expect(result).toMatchObject({ passed: true, failures: [], toolsCalled: ["get_shop_menu"] });
    // The judge sees the same fixed menu data the agent was given.
    const evidence = judge.mock.calls[0]![0].evidence;
    expect(evidence.find(({ id }) => id === "M1")?.content).toContain('"Large"');
  });

  it("reports each missed expectation instead of a bare failure", async () => {
    const respond = vi
      .fn<Respond>()
      .mockResolvedValue(answer("The shop opens at 7 am and serves UPI payments."));

    const result = await runLiveCase(
      evalCase({
        id: "invented-hours",
        question: "What time does the shop open on Sunday?",
        expectedKnowledgeIds: ["unconfirmed-shop-details"],
        expectedTools: ["get_shop_menu"],
        mustMention: ["not confirmed"],
        mustNotMention: ["\\b\\d{1,2}\\s?(am|pm)\\b"],
      }),
      { respond },
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      "missing live tool: get_shop_menu",
      "missing /not confirmed/",
      "forbidden /\\b\\d{1,2}\\s?(am|pm)\\b/",
      "no source citation",
    ]);
  });

  it("accepts a model refusal when the guardrail misses a change request", async () => {
    const respond = vi
      .fn<Respond>()
      .mockResolvedValue(answer("I’m read-only, so I cannot mark orders as ready."));

    const result = await runLiveCase(
      evalCase({
        id: "mark-ready",
        question: "Please mark order 1042 as ready.",
        shouldBlock: true,
        mustMention: ["cannot"],
      }),
      { respond },
    );

    expect(result).toMatchObject({ passed: true, blocked: false });
    expect(result.notes).toContain("guardrail missed; relying on the model's refusal");
  });

  it("fails when the guardrail refuses a legitimate question", async () => {
    const respond = vi.fn<Respond>();

    const result = await runLiveCase(
      evalCase({ id: "how-to", question: "How do staff cancel a confirmed order?" }),
      { respond },
    );

    expect(respond).not.toHaveBeenCalled();
    expect(result).toMatchObject({ passed: false, blocked: true });
    expect(result.failures).toContain("guardrail blocked a question it should have answered");
  });
});
