import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmbeddingCache } from "../evals/embedding-cache.js";
import { loadEvalCases } from "../evals/dataset.js";
import { evaluateRetrieval } from "../evals/offline-metrics.js";
import { createSemanticRetrievers, textsToEmbed } from "../evals/retrievers.js";
import type { Embed } from "../src/agents/openai-embeddings.js";

const settings = { model: "fake-embedding", dimensions: 3 };
const directories: string[] = [];
const cacheUrl = () => {
  const directory = mkdtempSync(join(tmpdir(), "eval-cache-"));
  directories.push(directory);
  return pathToFileURL(join(directory, "embeddings.cache.json"));
};
// Stand-in for the embeddings API: a stable vector derived from the text length.
const fakeApi = vi.fn<Embed>(async (texts) => ({
  vectors: texts.map((text) => [text.length % 7, 1, 0.25]),
  tokens: texts.length,
}));

describe("eval embedding cache", () => {
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
  });

  it("records once and replays without calling the API", async () => {
    const url = cacheUrl();
    const recorder = createEmbeddingCache(settings, url);
    expect(recorder.missing(["a", "bb", "a"])).toEqual(["a", "bb"]);
    await expect(recorder.embed(["a"])).rejects.toThrow(/not in the embedding cache/);

    expect(await recorder.fill(["a", "bb"], fakeApi)).toEqual({ embedded: 2, tokens: 2 });
    expect(await recorder.fill(["a", "bb"], fakeApi)).toEqual({ embedded: 0, tokens: 0 });

    const replay = createEmbeddingCache(settings, url);
    expect(replay.missing(["a", "bb"])).toEqual([]);
    // Float32 storage keeps these values exactly.
    expect(await replay.embed(["bb", "a"])).toEqual({
      vectors: [
        [2, 1, 0.25],
        [1, 1, 0.25],
      ],
      tokens: 0,
    });
  });

  it("ignores a cache recorded with another model or size", async () => {
    const url = cacheUrl();
    await createEmbeddingCache(settings, url).fill(["a"], fakeApi);
    expect(createEmbeddingCache({ ...settings, model: "other" }, url).missing(["a"])).toEqual([
      "a",
    ]);
    expect(createEmbeddingCache({ ...settings, dimensions: 4 }, url).missing(["a"])).toEqual(["a"]);
  });

  it("runs vector and hybrid retrieval evals entirely from the cache", async () => {
    const url = cacheUrl();
    const cases = loadEvalCases();
    const cache = createEmbeddingCache(settings, url);
    await cache.fill(textsToEmbed(cases), fakeApi);
    const calls = fakeApi.mock.calls.length;

    const { vector, hybrid } = await createSemanticRetrievers(cache.embed, 0);
    const vectorReport = await evaluateRetrieval(cases, vector);
    const hybridReport = await evaluateRetrieval(cases, hybrid);

    expect(fakeApi.mock.calls.length).toBe(calls);
    expect(vectorReport.cases).toHaveLength(hybridReport.cases.length);
    expect(hybridReport.cases.every(({ retrieved }) => retrieved.length <= 4)).toBe(true);
  });
});
