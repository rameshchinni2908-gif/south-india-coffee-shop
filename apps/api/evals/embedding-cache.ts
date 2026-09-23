import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { z } from "zod";

import {
  embeddingHash,
  type Embed,
  type EmbeddingSettings,
} from "../src/agents/openai-embeddings.js";

// Embeddings are recorded once with `npm run eval -- --refresh-embeddings` and replayed from
// this file, so vector and hybrid retrieval evals stay free and deterministic in CI.
const CACHE_URL = new URL("./embeddings.cache.json", import.meta.url);

const cacheSchema = z.object({
  model: z.string(),
  dimensions: z.number().int().positive(),
  // Keyed by embeddingHash(text); values are little-endian float32 arrays in base64.
  vectors: z.record(z.string(), z.string()),
});

const encode = (vector: number[]) =>
  Buffer.from(new Float32Array(vector).buffer).toString("base64");
const decode = (value: string) => {
  const bytes = Buffer.from(value, "base64");
  return [...new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)];
};

export const createEmbeddingCache = (settings: EmbeddingSettings, cacheUrl: URL = CACHE_URL) => {
  const stored = existsSync(cacheUrl)
    ? cacheSchema.parse(JSON.parse(readFileSync(cacheUrl, "utf8")))
    : null;
  // A cache recorded with another model or size is useless; start again.
  const vectors = new Map<string, string>(
    stored && stored.model === settings.model && stored.dimensions === settings.dimensions
      ? Object.entries(stored.vectors)
      : [],
  );
  const keyOf = (text: string) => embeddingHash(text, settings);

  return {
    missing: (texts: readonly string[]) =>
      [...new Set(texts)].filter((text) => !vectors.has(keyOf(text))),

    // Replays cached vectors only; never calls the API.
    embed: (async (texts) => {
      const unknown = texts.filter((text) => !vectors.has(keyOf(text)));
      if (unknown.length > 0) {
        throw new Error(`${unknown.length} text(s) are not in the embedding cache.`);
      }
      return { vectors: texts.map((text) => decode(vectors.get(keyOf(text))!)), tokens: 0 };
    }) satisfies Embed,

    // Embeds uncached texts with the real API, then writes the cache file.
    async fill(texts: readonly string[], embed: Embed) {
      const pending = [...new Set(texts)].filter((text) => !vectors.has(keyOf(text)));
      let tokens = 0;
      for (let start = 0; start < pending.length; start += 100) {
        const batch = pending.slice(start, start + 100);
        const result = await embed(batch);
        tokens += result.tokens;
        batch.forEach((text, index) => vectors.set(keyOf(text), encode(result.vectors[index]!)));
      }
      // Sorted keys keep the file's diff small when a few notes or cases change.
      const sorted = Object.fromEntries(
        [...vectors.entries()].sort(([a], [b]) => a.localeCompare(b)),
      );
      writeFileSync(
        cacheUrl,
        `${JSON.stringify({ model: settings.model, dimensions: settings.dimensions, vectors: sorted }, null, 1)}\n`,
      );
      return { embedded: pending.length, tokens };
    },
  };
};
