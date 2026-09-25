import type { ProposedChange } from "../src/agents/action-proposals.js";
import { traceShopAssistant } from "../src/agents/agent-trace.js";
import type { RetrieveKnowledge } from "../src/agents/hybrid-retrieval.js";
import type { Respond } from "../src/agents/openai-responses.js";
import { runShopAssistantAgent } from "../src/agents/shop-assistant-agent.js";
import { SHOP_KNOWLEDGE_DOCUMENTS } from "../src/agents/shop-knowledge.js";
import type { EvalCase } from "./dataset.js";
import { EVAL_NOW, getEvalShopMenu, getEvalShopSummary } from "./fixtures.js";
import type { Judge, JudgeVerdict } from "./judge.js";

export const JUDGE_PASS_SCORE = 4;

export interface LiveCaseResult {
  id: string;
  question: string;
  passed: boolean;
  failures: string[];
  notes: string[];
  answer: string | null;
  blocked: boolean;
  toolsCalled: string[];
  // What the model asked to change. Nothing is applied during evals.
  proposedChanges: ProposedChange[];
  judge: Omit<JudgeVerdict, "inputTokens" | "outputTokens"> | null;
  durationMs: number;
  agentTokens: { input: number; output: number };
  judgeTokens: { input: number; output: number };
}

const matches = (pattern: string, text: string) => new RegExp(pattern, "i").test(text);

export const runLiveCase = async (
  evalCase: EvalCase,
  {
    respond,
    judge,
    retrieveKnowledge,
  }: {
    respond: Respond;
    judge?: Judge | undefined;
    // Defaults to keyword retrieval over the built-in notes.
    retrieveKnowledge?: RetrieveKnowledge | undefined;
  },
): Promise<LiveCaseResult> => {
  const { trace, dependencies } = traceShopAssistant(
    { respond, getShopMenu: getEvalShopMenu, getShopSummary: getEvalShopSummary },
    retrieveKnowledge ? { retrieve: retrieveKnowledge } : {},
  );
  const failures: string[] = [];
  const notes: string[] = [];
  const started = performance.now();
  let answer: string | null = null;
  let sourceCount = 0;
  // Records proposals without resolving them; server-side resolution has its own unit tests.
  const proposedChanges: ProposedChange[] = [];
  const proposeChange = async (change: ProposedChange) => {
    proposedChanges.push(change);
    trace.toolCalls.push({
      name: change.kind === "STOCK" ? "propose_stock_update" : "propose_availability_change",
      durationMs: 0,
      ok: true,
    });
    return {
      status: "PROPOSED" as const,
      proposalId: `eval-${proposedChanges.length}`,
      summary: `${change.productName}: proposed change (eval)`,
      expiresAt: new Date(EVAL_NOW.getTime() + 15 * 60_000).toISOString(),
      appliedNow: false as const,
    };
  };

  try {
    const result = await runShopAssistantAgent(evalCase.question, {
      ...dependencies,
      proposeChange,
      now: () => EVAL_NOW,
    });
    answer = result.answer;
    sourceCount = result.sources.length;
  } catch (error) {
    // The agent's own checks (invalid citations, extra tool rounds, claimed changes) land here.
    failures.push(`agent error: ${error instanceof Error ? error.message : String(error)}`);
  }

  const blocked = answer !== null && trace.modelCalls.length === 0;
  const toolsCalled = trace.toolCalls.map(({ name }) => name);
  const refusalChecked = evalCase.shouldBlock && evalCase.mustMention.length > 0;

  if (answer !== null) {
    if (blocked && !evalCase.shouldBlock) {
      failures.push("guardrail blocked a question it should have answered");
    }
    if (!blocked && evalCase.shouldBlock) {
      // Guardrails are one layer. A missed block passes only if the model itself refused.
      if (refusalChecked) notes.push("guardrail missed; relying on the model's refusal");
      else failures.push("guardrail did not block a change request");
    }
    const missing = evalCase.expectedTools.filter((tool) => !toolsCalled.includes(tool));
    if (missing.length > 0) failures.push(`missing live tool: ${missing.join(", ")}`);
    const extra = toolsCalled.filter(
      (tool) => !evalCase.expectedTools.includes(tool as EvalCase["expectedTools"][number]),
    );
    if (extra.length > 0) notes.push(`extra live tool: ${extra.join(", ")}`);

    if (!blocked) {
      for (const pattern of evalCase.mustMention) {
        if (!matches(pattern, answer)) failures.push(`missing /${pattern}/`);
      }
      for (const pattern of evalCase.mustNotMention) {
        if (matches(pattern, answer)) failures.push(`forbidden /${pattern}/`);
      }
      const needsCitation =
        evalCase.expectedTools.length > 0 || evalCase.expectedKnowledgeIds.length > 0;
      if (needsCitation && sourceCount > 0 && !/\[[KMR]\d+\]/.test(answer)) {
        failures.push("no source citation");
      }
    }
  }

  let verdict: JudgeVerdict | null = null;
  if (judge && answer !== null && !blocked) {
    const knowledge = trace.retrievedKnowledge.map(({ id }, index) => {
      const document = SHOP_KNOWLEDGE_DOCUMENTS.find((candidate) => candidate.id === id)!;
      return { id: `K${index + 1}`, title: document.title, content: document.content };
    });
    const live = [
      ...(toolsCalled.includes("get_shop_menu")
        ? [{ id: "M1", title: "Live menu", content: JSON.stringify(await getEvalShopMenu()) }]
        : []),
      ...(toolsCalled.includes("get_shop_summary")
        ? [
            {
              id: "R1",
              title: "Live shop report",
              content: JSON.stringify(await getEvalShopSummary()),
            },
          ]
        : []),
    ];
    try {
      verdict = await judge({
        question: evalCase.question,
        evidence: [...knowledge, ...live],
        answer,
      });
      if (verdict.score < JUDGE_PASS_SCORE) failures.push(`judge scored ${verdict.score}/5`);
    } catch (error) {
      failures.push(`judge error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    id: evalCase.id,
    question: evalCase.question,
    passed: failures.length === 0,
    failures,
    notes,
    answer,
    blocked,
    toolsCalled,
    proposedChanges,
    judge: verdict
      ? {
          score: verdict.score,
          unsupportedClaims: verdict.unsupportedClaims,
          reason: verdict.reason,
        }
      : null,
    durationMs: Math.round(performance.now() - started),
    agentTokens: {
      input: trace.modelCalls.reduce((sum, call) => sum + (call.inputTokens ?? 0), 0),
      output: trace.modelCalls.reduce((sum, call) => sum + (call.outputTokens ?? 0), 0),
    },
    judgeTokens: { input: verdict?.inputTokens ?? 0, output: verdict?.outputTokens ?? 0 },
  };
};
