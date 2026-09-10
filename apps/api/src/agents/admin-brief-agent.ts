import { z } from "zod";

import { adminBriefQuestionSchema } from "../validation/admin-agent-schemas.js";
import type { ModelInput, ModelResponse, Respond } from "./openai-responses.js";
import type { ShopSnapshot } from "./shop-summary-tool.js";

const callSchema = z.object({
  type: z.literal("function_call"),
  name: z.literal("get_shop_summary"),
  arguments: z.string(),
  call_id: z.string().min(1),
});

const readAnswer = (response: ModelResponse): string => {
  const messageSchema = z.object({
    type: z.literal("message"),
    content: z.array(z.object({ type: z.literal("output_text"), text: z.string() })),
  });
  const answer = response.output
    .flatMap((item) => {
      const message = messageSchema.safeParse(item);
      return message.success ? message.data.content.map((content) => content.text) : [];
    })
    .join("\n")
    .trim();
  if (!answer) throw new Error("The model did not return a text answer.");
  return answer;
};

interface AgentDependencies {
  respond: Respond;
  getShopSummary(): Promise<ShopSnapshot>;
  trace?(message: string): void;
}

export const runAdminBriefAgent = async (
  question: string,
  { respond, getShopSummary, trace = () => undefined }: AgentDependencies,
): Promise<{ answer: string; usedShopData: boolean }> => {
  const parsed = adminBriefQuestionSchema.safeParse(question);
  if (!parsed.success) throw new Error("Ask a question between 1 and 500 characters.");
  const input: ModelInput[] = [{ role: "user", content: parsed.data }];

  // 1. The model sees the question and the one tool it may request.
  trace("1. Sending your question and the permitted tool definition to the model.");
  const first = await respond({ input, toolChoice: "auto" });
  const calls = first.output.filter((item) => item.type === "function_call");
  if (calls.length === 0) {
    trace(
      "2. The model answered without reading shop data. Treat this as a scope explanation only.",
    );
    return { answer: readAnswer(first), usedShopData: false };
  }

  // 2. Validate the request before running our code. No arbitrary function lookup or eval.
  if (calls.length !== 1) throw new Error("Lesson one permits only one tool call per question.");
  const call = callSchema.safeParse(calls[0]);
  if (!call.success) throw new Error("The model requested a tool that is not permitted.");
  let args: unknown;
  try {
    args = JSON.parse(call.data.arguments);
  } catch {
    throw new Error("The model returned invalid tool arguments.");
  }
  if (!z.object({}).strict().safeParse(args).success) {
    throw new Error("get_shop_summary does not accept arguments.");
  }

  // 3. Our authenticated application client executes the read; the model does not access MongoDB.
  trace("2. Model requested get_shop_summary({}); the request passed validation.");
  const snapshot = await getShopSummary();
  trace(`3. Read the protected report. Snapshot: ${snapshot.generatedAt} (${snapshot.timezone}).`);

  // 4. call_id connects this result to the model's exact request.
  input.push(...first.output, {
    type: "function_call_output",
    call_id: call.data.call_id,
    output: JSON.stringify(snapshot),
  });
  trace("4. Sending the filtered report to the model for a short briefing.");
  const last = await respond({ input, toolChoice: "none" });
  if (last.output.some((item) => item.type === "function_call")) {
    throw new Error("The model tried to exceed this lesson's one-tool limit.");
  }
  trace("5. Briefing received. The shop's records were not changed.");
  return { answer: readAnswer(last), usedShopData: true };
};
