import "dotenv/config";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { z } from "zod";

import { DEFAULT_MIN_SIMILARITY } from "../src/agents/hybrid-retrieval.js";
import { createOpenAiEmbedder } from "../src/agents/openai-embeddings.js";
import { createOpenAiResponder } from "../src/agents/openai-responses.js";
import { SHOP_ASSISTANT_RESPONDER_OPTIONS } from "../src/agents/shop-assistant-instructions.js";
import { loadEvalCases } from "./dataset.js";
import { createEmbeddingCache } from "./embedding-cache.js";
import { createOpenAiJudge } from "./judge.js";
import { runLiveCase, type LiveCaseResult } from "./live-eval.js";
import {
  evaluateGuardrail,
  evaluateRetrieval,
  keywordRetriever,
  type RetrievalReport,
} from "./offline-metrics.js";
import { createSemanticRetrievers, evalEmbeddingSettings, textsToEmbed } from "./retrievers.js";

const USAGE = `Usage: npm run eval -- [options]

  (no flags)            Offline evals: retrieval and guardrail metrics. Free, deterministic.
                        Vector and hybrid retrieval replay evals/embeddings.cache.json.
  --refresh-embeddings  Embed notes and questions missing from the cache (tiny API cost).
  --min-similarity <n>  Try another vector similarity threshold (default ${DEFAULT_MIN_SIMILARITY}).
  --live                Also run each case through the real model with fixed shop data.
  --case <id>           Limit live runs to specific case IDs (repeatable).
  --no-judge            Skip the LLM-as-judge groundedness score during live runs.
  --update-baseline     Save these scores as the new minimums in evals/baseline.json.

Environment: OPENAI_API_KEY, OPENAI_MODEL, optional OPENAI_JUDGE_MODEL (defaults to OPENAI_MODEL),
OPENAI_EMBEDDING_MODEL and OPENAI_EMBEDDING_DIMENSIONS (must match the API's settings).`;

const baselineSchema = z.object({
  offline: z.object({
    retrievalRecallAtK: z.number(),
    retrievalHitRate: z.number(),
    retrievalMrr: z.number(),
    guardrailPrecision: z.number(),
    guardrailRecall: z.number(),
    // Gated only when the embedding cache covers every note and question.
    hybridRecallAtK: z.number().optional(),
    hybridHitRate: z.number().optional(),
    hybridMrr: z.number().optional(),
  }),
  live: z.object({ passRate: z.number(), meanJudgeScore: z.number() }),
});
type Baseline = z.infer<typeof baselineSchema>;

const BASELINE_URL = new URL("./baseline.json", import.meta.url);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
// Round down so a saved baseline never sits above the score it came from.
const round = (value: number) => Math.floor(value * 1000) / 1000;

const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    case: { type: "string", multiple: true },
    "no-judge": { type: "boolean", default: false },
    "update-baseline": { type: "boolean", default: false },
    "refresh-embeddings": { type: "boolean", default: false },
    "min-similarity": { type: "string" },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const cases = loadEvalCases();
const baseline = baselineSchema.parse(JSON.parse(readFileSync(BASELINE_URL, "utf8")));
const regressions: string[] = [];
const checkMinimum = (label: string, actual: number, minimum: number, format = percent) => {
  // A tiny tolerance avoids failing on floating-point noise.
  const ok = actual + 1e-9 >= minimum;
  if (!ok) regressions.push(`${label} ${format(actual)} is below the baseline ${format(minimum)}`);
  return `${format(actual).padStart(7)}  (baseline ${format(minimum)})${ok ? "" : "  ✗ REGRESSION"}`;
};

// ── Embeddings ───────────────────────────────────────────────────────────────
const minSimilarity = values["min-similarity"]
  ? Number(values["min-similarity"])
  : DEFAULT_MIN_SIMILARITY;
const embeddingSettings = evalEmbeddingSettings();
const embeddingCache = createEmbeddingCache(embeddingSettings);
if (values["refresh-embeddings"]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("\n--refresh-embeddings needs OPENAI_API_KEY (see apps/api/.env).");
    process.exit(2);
  }
  const { embedded, tokens } = await embeddingCache.fill(
    textsToEmbed(cases),
    createOpenAiEmbedder({ apiKey, ...embeddingSettings }),
  );
  console.log(
    `\nEmbedded ${embedded} new text(s) with ${embeddingSettings.model} (${tokens} tokens).`,
  );
}
const uncached = embeddingCache.missing(textsToEmbed(cases)).length;
const semantic =
  uncached === 0 ? await createSemanticRetrievers(embeddingCache.embed, minSimilarity) : null;

// ── Offline: retrieval ───────────────────────────────────────────────────────
type Method = "keyword" | "vector" | "hybrid";
const keyword = await evaluateRetrieval(cases, keywordRetriever);
const reports: Partial<Record<Method, RetrievalReport>> = { keyword };
if (semantic) {
  reports.vector = await evaluateRetrieval(cases, semantic.vector);
  reports.hybrid = await evaluateRetrieval(cases, semantic.hybrid);
}
const hybrid = reports.hybrid;
const methods = (["keyword", "vector", "hybrid"] as const).filter((method) => reports[method]);
const mark = (method: Method, id: string) => {
  const result = reports[method]!.cases.find((candidate) => candidate.id === id)!;
  if (result.recall === 0) return "·";
  return result.reciprocalRank === 1 ? "●" : "◐";
};

console.log(
  `\nRETRIEVAL  (${keyword.cases.length} cases with expected notes · ● ranked first  ◐ found  · missed)`,
);
console.log(`  ${methods.map((method) => method[0]!.toUpperCase()).join(" ")}  case`);
for (const { id, expected } of keyword.cases) {
  console.log(
    `  ${methods.map((method) => mark(method, id)).join(" ")}  ${id.padEnd(34)} expects ${expected.join(", ")}`,
  );
  // Show what the production method returned whenever it missed.
  const retrieved = (hybrid ?? keyword).cases.find((result) => result.id === id)!.retrieved;
  if (!retrieved.some((note) => expected.includes(note.id))) {
    const got = retrieved.map((note) => `${note.id}:${note.score}`).join(" ") || "(nothing)";
    console.log(`         got ${got}`);
  }
}

const rows: [string, (report: RetrievalReport) => string][] = [
  ["recall@4", (report) => percent(report.recallAtK)],
  ["hit rate", (report) => percent(report.hitRate)],
  ["MRR", (report) => report.mrr.toFixed(3)],
  ["precision", (report) => percent(report.precisionAtK)],
  ["off-topic", (report) => `${report.offTopicNotesPerQuestion.toFixed(1)} notes`],
];
console.log(`\n  ${"".padEnd(10)}${methods.map((method) => method.padStart(11)).join("")}`);
for (const [label, format] of rows) {
  console.log(
    `  ${label.padEnd(10)}${methods.map((method) => format(reports[method]!).padStart(11)).join("")}`,
  );
}
console.log(
  semantic
    ? `  vector: ${embeddingSettings.model}, ${embeddingSettings.dimensions} dimensions, similarity ≥ ${minSimilarity}`
    : `  Vector and hybrid skipped: ${uncached} text(s) missing from the embedding cache. Run with --refresh-embeddings.`,
);

console.log("\n  Gates");
console.log(
  `  keyword recall@4  ${checkMinimum("Keyword recall@4", keyword.recallAtK, baseline.offline.retrievalRecallAtK)}`,
);
console.log(
  `  keyword hit rate  ${checkMinimum("Keyword hit rate", keyword.hitRate, baseline.offline.retrievalHitRate)}`,
);
console.log(
  `  keyword MRR       ${checkMinimum("Keyword MRR", keyword.mrr, baseline.offline.retrievalMrr, (v) => v.toFixed(3))}`,
);
if (hybrid && baseline.offline.hybridRecallAtK !== undefined) {
  console.log(
    `  hybrid recall@4   ${checkMinimum("Hybrid recall@4", hybrid.recallAtK, baseline.offline.hybridRecallAtK)}`,
  );
  console.log(
    `  hybrid hit rate   ${checkMinimum("Hybrid hit rate", hybrid.hitRate, baseline.offline.hybridHitRate ?? 0)}`,
  );
  console.log(
    `  hybrid MRR        ${checkMinimum("Hybrid MRR", hybrid.mrr, baseline.offline.hybridMrr ?? 0, (v) => v.toFixed(3))}`,
  );
}

// ── Offline: guardrail ───────────────────────────────────────────────────────
const guardrail = evaluateGuardrail(cases);
console.log(`\nGUARDRAIL  (${cases.length} questions)`);
console.log(`  blocked correctly      ${guardrail.truePositives.length}`);
console.log(`  wrongly blocked (FP)   ${guardrail.falsePositives.join(", ") || "none"}`);
console.log(`  missed (FN)            ${guardrail.falseNegatives.join(", ") || "none"}`);
console.log(
  `  precision  ${checkMinimum("Guardrail precision", guardrail.precision, baseline.offline.guardrailPrecision)}`,
);
console.log(
  `  recall     ${checkMinimum("Guardrail recall", guardrail.recall, baseline.offline.guardrailRecall)}`,
);

// ── Live: end-to-end with the real model ────────────────────────────────────
let live: { results: LiveCaseResult[]; passRate: number; meanJudgeScore: number | null } | null =
  null;
if (values.live) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) {
    console.error("\n--live needs OPENAI_API_KEY and OPENAI_MODEL (see apps/api/.env).");
    process.exit(2);
  }
  const judgeModel = process.env.OPENAI_JUDGE_MODEL || model;
  const respond = createOpenAiResponder({ apiKey, model, ...SHOP_ASSISTANT_RESPONDER_OPTIONS });
  const judge = values["no-judge"] ? undefined : createOpenAiJudge({ apiKey, model: judgeModel });
  // Live runs use the production retrieval path: hybrid when the embedding cache is complete.
  const retrieveKnowledge = semantic?.retrieveKnowledge;
  const selected = values.case?.length
    ? cases.filter(({ id }) => values.case!.includes(id))
    : cases;
  if (selected.length === 0) {
    console.error(`\nNo cases match: ${values.case?.join(", ")}`);
    process.exit(2);
  }

  console.log(
    `\nLIVE  (${selected.length} cases · agent ${model}${judge ? ` · judge ${judgeModel}` : " · no judge"} · ${retrieveKnowledge ? "hybrid" : "keyword"} retrieval)`,
  );
  const results: LiveCaseResult[] = [];
  // Sequential on purpose: predictable cost and no rate-limit bursts.
  for (const evalCase of selected) {
    const result = await runLiveCase(evalCase, { respond, judge, retrieveKnowledge });
    results.push(result);
    const score = result.judge ? ` judge ${result.judge.score}/5` : "";
    console.log(
      `  ${result.passed ? "pass" : "FAIL"} ${result.id.padEnd(36)} ${(result.durationMs / 1000).toFixed(1)}s${score}`,
    );
    for (const failure of result.failures) console.log(`         ✗ ${failure}`);
    for (const note of result.notes) console.log(`         · ${note}`);
  }

  const judged = results.flatMap(({ judge: verdict }) => (verdict ? [verdict.score] : []));
  const passRate = results.filter(({ passed }) => passed).length / results.length;
  const meanJudgeScore = judged.length
    ? judged.reduce((sum, score) => sum + score, 0) / judged.length
    : null;
  const tokens = results.reduce(
    (sum, result) =>
      sum +
      result.agentTokens.input +
      result.agentTokens.output +
      result.judgeTokens.input +
      result.judgeTokens.output,
    0,
  );
  live = { results, passRate, meanJudgeScore };

  // Subsets are for debugging; only full runs are compared with the baseline.
  const gate = !values.case?.length;
  console.log(
    `  pass rate  ${gate ? checkMinimum("Live pass rate", passRate, baseline.live.passRate) : percent(passRate)}`,
  );
  if (meanJudgeScore !== null) {
    console.log(
      `  judge mean ${gate ? checkMinimum("Mean judge score", meanJudgeScore, baseline.live.meanJudgeScore, (v) => v.toFixed(2)) : meanJudgeScore.toFixed(2)}`,
    );
  }
  console.log(`  tokens     ${tokens.toLocaleString("en-IN")} (agent + judge)`);
}

// ── Report ───────────────────────────────────────────────────────────────────
const reportDirectory = new URL("./reports/", import.meta.url);
mkdirSync(reportDirectory, { recursive: true });
const reportUrl = new URL(
  `${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  reportDirectory,
);
writeFileSync(
  reportUrl,
  `${JSON.stringify({ retrieval: reports, minSimilarity, guardrail, live }, null, 2)}\n`,
);
console.log(`\nFull report: ${reportUrl.pathname.replace(/^\/([A-Za-z]:)/, "$1")}`);

if (values["update-baseline"]) {
  const next: Baseline = {
    offline: {
      retrievalRecallAtK: round(keyword.recallAtK),
      retrievalHitRate: round(keyword.hitRate),
      retrievalMrr: round(keyword.mrr),
      guardrailPrecision: round(guardrail.precision),
      guardrailRecall: round(guardrail.recall),
      ...(hybrid
        ? {
            hybridRecallAtK: round(hybrid.recallAtK),
            hybridHitRate: round(hybrid.hitRate),
            hybridMrr: round(hybrid.mrr),
          }
        : {}),
    },
    live:
      live && !values.case?.length
        ? { passRate: round(live.passRate), meanJudgeScore: round(live.meanJudgeScore ?? 0) }
        : baseline.live,
  };
  writeFileSync(BASELINE_URL, `${JSON.stringify(next, null, 2)}\n`);
  console.log("Baseline updated. Review and commit evals/baseline.json.");
} else if (regressions.length > 0) {
  console.error(`\n${regressions.length} regression(s):\n  - ${regressions.join("\n  - ")}`);
  process.exit(1);
}
