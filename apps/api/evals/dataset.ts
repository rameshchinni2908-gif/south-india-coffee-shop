import { readFileSync } from "node:fs";

import { z } from "zod";

import { SHOP_KNOWLEDGE_DOCUMENTS } from "../src/agents/shop-knowledge.js";

const knowledgeIds = SHOP_KNOWLEDGE_DOCUMENTS.map((document) => document.id) as [
  string,
  ...string[],
];

// Patterns are case-insensitive regular expressions checked against the final answer.
const patterns = z
  .array(
    z.string().refine((pattern) => {
      try {
        new RegExp(pattern, "i");
        return true;
      } catch {
        return false;
      }
    }, "Invalid regular expression"),
  )
  .default([]);

export const evalCaseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    question: z.string().trim().min(1).max(500),
    tags: z.array(z.string()).default([]),
    // Reference notes that must be retrieved for a correct answer. Empty means none required.
    expectedKnowledgeIds: z.array(z.enum(knowledgeIds)).default([]),
    // Live tools the agent must call before it can answer correctly.
    expectedTools: z.array(z.enum(["get_shop_menu", "get_shop_summary"])).default([]),
    // Whether the deterministic question guardrail should refuse before any model request.
    shouldBlock: z.boolean().default(false),
    mustMention: patterns,
    mustNotMention: patterns,
  })
  .strict();

export type EvalCase = z.infer<typeof evalCaseSchema>;

export const loadEvalCases = (
  url: URL = new URL("./shop-assistant.cases.json", import.meta.url),
): EvalCase[] => {
  const cases = z.array(evalCaseSchema).parse(JSON.parse(readFileSync(url, "utf8")));
  const duplicate = cases.find(
    (evalCase, index) => cases.findIndex(({ id }) => id === evalCase.id) !== index,
  );
  if (duplicate) throw new Error(`Duplicate eval case id: ${duplicate.id}`);
  return cases;
};
