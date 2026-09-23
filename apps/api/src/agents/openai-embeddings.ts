import { createHash } from "node:crypto";

import { z } from "zod";

import type { KnowledgeDocument } from "./shop-knowledge.js";

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
// text-embedding-3 models can return shorter vectors. 512 keeps most of the quality
// at a third of the storage and comparison cost of the full 1536 dimensions.
export const DEFAULT_EMBEDDING_DIMENSIONS = 512;
const MAX_TEXTS_PER_REQUEST = 100;

export interface EmbeddingResult {
  vectors: number[][];
  tokens: number;
}

export type Embed = (texts: string[], signal?: AbortSignal) => Promise<EmbeddingResult>;

export interface EmbeddingSettings {
  model: string;
  dimensions: number;
}

// The text a note is embedded from. Changing this changes every hash, so all notes re-embed.
export const knowledgeEmbeddingText = ({ title, content, keywords }: KnowledgeDocument): string =>
  `${title}\n${content}${keywords.length ? `\nKeywords: ${keywords.join(", ")}` : ""}`;

// A vector is only valid for the exact text, model and size it was made from.
export const embeddingHash = (text: string, { model, dimensions }: EmbeddingSettings): string =>
  createHash("sha256").update(`${model}\n${dimensions}\n${text}`).digest("hex");

const responseSchema = z.object({
  data: z.array(
    z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number()) }),
  ),
  usage: z.object({ total_tokens: z.number().int().nonnegative() }).optional(),
});

export const createOpenAiEmbedder =
  ({
    apiKey,
    model,
    dimensions,
    fetcher = fetch,
  }: EmbeddingSettings & { apiKey: string; fetcher?: typeof fetch }): Embed =>
  async (texts, signal) => {
    if (texts.length === 0) return { vectors: [], tokens: 0 };
    if (texts.length > MAX_TEXTS_PER_REQUEST) {
      throw new Error(`Embed at most ${MAX_TEXTS_PER_REQUEST} texts per request.`);
    }
    const response = await fetcher("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts, dimensions, encoding_format: "float" }),
      redirect: "error",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
        : AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`OpenAI embedding request failed (HTTP ${response.status}).`);
    }
    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success || parsed.data.data.length !== texts.length) {
      throw new Error("OpenAI returned an unexpected embedding response.");
    }
    // The API may return items out of order; `index` maps each back to its input.
    const vectors = [...parsed.data.data]
      .sort((left, right) => left.index - right.index)
      .map(({ embedding }) => embedding);
    if (vectors.some((vector) => vector.length !== dimensions)) {
      throw new Error("OpenAI returned embeddings with unexpected dimensions.");
    }
    return { vectors, tokens: parsed.data.usage?.total_tokens ?? 0 };
  };
