import { describe, expect, it, vi } from "vitest";

import {
  createOpenAiEmbedder,
  embeddingHash,
  knowledgeEmbeddingText,
} from "../src/agents/openai-embeddings.js";

const settings = { model: "text-embedding-3-small", dimensions: 2 };
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("OpenAI embeddings client", () => {
  it("requests shortened vectors and restores input order", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      reply({
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
        usage: { prompt_tokens: 7, total_tokens: 7 },
      }),
    );
    const embed = createOpenAiEmbedder({ ...settings, apiKey: "test-key", fetcher });

    expect(await embed(["first", "second"])).toEqual({
      vectors: [
        [1, 0],
        [0, 1],
      ],
      tokens: 7,
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "text-embedding-3-small",
      input: ["first", "second"],
      dimensions: 2,
      encoding_format: "float",
    });
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
  });

  it("makes no request for an empty batch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const embed = createOpenAiEmbedder({ ...settings, apiKey: "k", fetcher });
    expect(await embed([])).toEqual({ vectors: [], tokens: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [reply({ error: "private detail" }, 429), /HTTP 429/],
    [reply({ data: [{ index: 0, embedding: [1, 0, 0] }] }), /unexpected dimensions/],
    [reply({ data: [] }), /unexpected embedding response/],
  ])("rejects unusable responses without exposing their body", async (response, message) => {
    const embed = createOpenAiEmbedder({
      ...settings,
      apiKey: "k",
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(response),
    });
    const failure = embed(["text"]);
    await expect(failure).rejects.toThrow(message);
    await expect(failure).rejects.not.toThrow(/private detail/);
  });
});

describe("embedding identity", () => {
  const document = { id: "n", title: "Title", content: "Body", keywords: ["a", "b"] };

  it("embeds the title, content and keywords together", () => {
    expect(knowledgeEmbeddingText(document)).toBe("Title\nBody\nKeywords: a, b");
    expect(knowledgeEmbeddingText({ ...document, keywords: [] })).toBe("Title\nBody");
  });

  it("changes the hash when the text, model or size changes", () => {
    const text = knowledgeEmbeddingText(document);
    const hash = embeddingHash(text, settings);
    expect(embeddingHash(text, settings)).toBe(hash);
    expect(embeddingHash(`${text}!`, settings)).not.toBe(hash);
    expect(embeddingHash(text, { ...settings, model: "other" })).not.toBe(hash);
    expect(embeddingHash(text, { ...settings, dimensions: 3 })).not.toBe(hash);
  });
});
