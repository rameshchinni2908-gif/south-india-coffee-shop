import { z } from "zod";

import { readModelAnswer } from "./read-model-answer.js";

export interface StructuredRequest {
  instructions: string;
  input: string;
  schemaName: string;
  // A strict JSON Schema. The API constrains generation so the output always matches it.
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export type RespondStructured = (request: StructuredRequest) => Promise<unknown>;

const responseSchema = z.object({
  status: z.literal("completed"),
  output: z.array(z.object({ type: z.string() }).passthrough()).max(20),
});

export const createOpenAiStructuredResponder =
  ({
    apiKey,
    model,
    fetcher = fetch,
  }: {
    apiKey: string;
    model: string;
    fetcher?: typeof fetch;
  }): RespondStructured =>
  async ({ instructions, input, schemaName, schema, maxOutputTokens, signal }) => {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions,
        input: [{ role: "user", content: input }],
        text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
        max_output_tokens: maxOutputTokens,
        store: false,
      }),
      redirect: "error",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`OpenAI request failed (HTTP ${response.status}).`);
    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    // An incomplete response (for example, cut off at the token limit) is not trusted.
    if (!parsed.success) throw new Error("OpenAI returned an incomplete response.");
    return JSON.parse(readModelAnswer(parsed.data)) as unknown;
  };
