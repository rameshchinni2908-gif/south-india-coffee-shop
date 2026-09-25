import { describe, expect, it, vi } from "vitest";

import { createOpenAiStructuredResponder } from "../src/agents/openai-structured.js";

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const completed = (text: string) =>
  reply({
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text }] }],
  });
const request = {
  instructions: "List items.",
  input: "two coffees",
  schemaName: "order_draft",
  schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  maxOutputTokens: 500,
};

describe("OpenAI structured responder", () => {
  it("requests a strict JSON Schema and returns the parsed object", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completed('{"items":[]}'));
    const respond = createOpenAiStructuredResponder({ apiKey: "k", model: "m", fetcher });

    expect(await respond(request)).toEqual({ items: [] });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "m",
      instructions: "List items.",
      input: [{ role: "user", content: "two coffees" }],
      text: { format: { type: "json_schema", name: "order_draft", strict: true } },
      max_output_tokens: 500,
      store: false,
    });
  });

  it.each([
    [reply({ status: "incomplete", output: [] }), /incomplete/],
    [reply({ error: "private" }, 429), /HTTP 429/],
  ])("rejects unusable responses (%#)", async (response, message) => {
    const respond = createOpenAiStructuredResponder({
      apiKey: "k",
      model: "m",
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(response),
    });
    await expect(respond(request)).rejects.toThrow(message);
  });
});
