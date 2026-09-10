import { describe, expect, it, vi } from "vitest";

import { createOpenAiResponder, SUMMARY_TOOL } from "../src/agents/openai-responses.js";

describe("OpenAI Responses adapter", () => {
  it("sends a bounded stateless tool request and preserves reasoning state for the loop", async () => {
    const output = [
      { type: "reasoning", id: "rs_test", encrypted_content: "opaque-state", summary: [] },
      { type: "function_call", call_id: "call_test", name: "get_shop_summary", arguments: "{}" },
    ];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ status: "completed", output }));
    const respond = createOpenAiResponder({ apiKey: "test-key", model: "gpt-5.4-mini", fetcher });
    const input = [{ role: "user", content: "How is the shop today?" }];
    expect(await respond({ input, toolChoice: "auto" })).toEqual({ status: "completed", output });
    const [url, request] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(request).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { Authorization: "Bearer test-key" },
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    const body: unknown = JSON.parse(String(request?.body));
    expect(body).toMatchObject({
      model: "gpt-5.4-mini",
      input,
      tools: [SUMMARY_TOOL],
      tool_choice: "auto",
      parallel_tool_calls: false,
      max_output_tokens: 1600,
      store: false,
      include: ["reasoning.encrypted_content"],
    });
    expect(JSON.stringify(body)).not.toContain("test-key");
    await respond({ input, toolChoice: "none" });
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      tool_choice: "none",
    });
  });

  it.each([401, 429, 500])(
    "does not expose provider error bodies or retry HTTP %s",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("private provider details", { status }));
      const respond = createOpenAiResponder({ apiKey: "test-key", model: "test-model", fetcher });
      await expect(respond({ input: [], toolChoice: "auto" })).rejects.toThrow(
        `OpenAI request failed (HTTP ${status})`,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { status: "incomplete", output: [] },
    { status: "failed", output: [] },
    { status: "completed", output: "invalid" },
  ])("rejects incomplete or malformed responses", async (body) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    const respond = createOpenAiResponder({ apiKey: "test-key", model: "test-model", fetcher });
    await expect(respond({ input: [], toolChoice: "auto" })).rejects.toThrow(
      "incomplete or unexpected response",
    );
  });

  it("does not print a non-JSON upstream response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("sensitive invalid JSON"));
    const respond = createOpenAiResponder({ apiKey: "test-key", model: "test-model", fetcher });
    await expect(respond({ input: [], toolChoice: "auto" })).rejects.toThrow(
      "OpenAI returned an unreadable response.",
    );
  });
});
