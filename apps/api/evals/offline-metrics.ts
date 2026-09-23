import { checkShopAssistantQuestion } from "../src/agents/shop-assistant-guardrails.js";
import { rankShopKnowledge } from "../src/agents/shop-knowledge-retrieval.js";
import type { EvalCase } from "./dataset.js";

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const ratio = (numerator: number, denominator: number) =>
  denominator === 0 ? 1 : numerator / denominator;

export interface RetrievalCaseResult {
  id: string;
  expected: string[];
  retrieved: { id: string; score: number }[];
  // Share of expected notes found in the top results.
  recall: number;
  // 1 / rank of the first expected note; 0 when none was found.
  reciprocalRank: number;
  // Share of retrieved notes that were expected. Extra notes cost tokens and can distract.
  precision: number;
}

export interface RetrievalReport {
  cases: RetrievalCaseResult[];
  recallAtK: number;
  hitRate: number;
  mrr: number;
  precisionAtK: number;
  offTopicNotesPerQuestion: number;
}

export type EvalRetriever = (question: string) => Promise<{ id: string; score: number }[]>;

export const keywordRetriever: EvalRetriever = async (question) =>
  rankShopKnowledge(question).map(({ document, score }) => ({ id: document.id, score }));

export const evaluateRetrieval = async (
  cases: readonly EvalCase[],
  retrieve: EvalRetriever = keywordRetriever,
): Promise<RetrievalReport> => {
  const results: RetrievalCaseResult[] = [];
  for (const evalCase of cases.filter(({ expectedKnowledgeIds }) => expectedKnowledgeIds.length)) {
    const retrieved = await retrieve(evalCase.question);
    const expected = new Set(evalCase.expectedKnowledgeIds);
    const found = retrieved.filter(({ id }) => expected.has(id));
    const firstRank = retrieved.findIndex(({ id }) => expected.has(id));
    results.push({
      id: evalCase.id,
      expected: [...expected],
      retrieved,
      recall: found.length / expected.size,
      reciprocalRank: firstRank === -1 ? 0 : 1 / (firstRank + 1),
      precision: retrieved.length === 0 ? 0 : found.length / retrieved.length,
    });
  }

  // Off-topic questions should retrieve nothing; every note sent is wasted tokens and a
  // chance for the model to answer from irrelevant evidence.
  const offTopic = cases.filter(({ tags }) => tags.includes("scope"));
  let offTopicNotes = 0;
  for (const evalCase of offTopic) offTopicNotes += (await retrieve(evalCase.question)).length;

  return {
    cases: results,
    recallAtK: mean(results.map(({ recall }) => recall)),
    hitRate: mean(results.map(({ recall }) => (recall > 0 ? 1 : 0))),
    mrr: mean(results.map(({ reciprocalRank }) => reciprocalRank)),
    precisionAtK: mean(results.map(({ precision }) => precision)),
    offTopicNotesPerQuestion: offTopic.length ? offTopicNotes / offTopic.length : 0,
  };
};

export interface GuardrailReport {
  truePositives: string[];
  falsePositives: string[];
  falseNegatives: string[];
  trueNegatives: number;
  // Of the questions blocked, how many should have been. Low precision blocks real questions.
  precision: number;
  // Of the questions that should be blocked, how many were. Low recall lets mutations through.
  recall: number;
}

export const evaluateGuardrail = (
  cases: readonly EvalCase[],
  check: (question: string) => { allowed: boolean } = checkShopAssistantQuestion,
): GuardrailReport => {
  const report: GuardrailReport = {
    truePositives: [],
    falsePositives: [],
    falseNegatives: [],
    trueNegatives: 0,
    precision: 0,
    recall: 0,
  };
  for (const evalCase of cases) {
    const blocked = !check(evalCase.question).allowed;
    if (blocked && evalCase.shouldBlock) report.truePositives.push(evalCase.id);
    else if (blocked) report.falsePositives.push(evalCase.id);
    else if (evalCase.shouldBlock) report.falseNegatives.push(evalCase.id);
    else report.trueNegatives += 1;
  }
  const truePositives = report.truePositives.length;
  report.precision = ratio(truePositives, truePositives + report.falsePositives.length);
  report.recall = ratio(truePositives, truePositives + report.falseNegatives.length);
  return report;
};
