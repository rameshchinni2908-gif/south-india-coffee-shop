import {
  createHybridRetriever,
  DEFAULT_MIN_SIMILARITY,
  RETRIEVAL_LIMIT,
  searchVectorsInMemory,
  type RetrieveKnowledge,
} from "../src/agents/hybrid-retrieval.js";
import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  knowledgeEmbeddingText,
  type Embed,
  type EmbeddingSettings,
} from "../src/agents/openai-embeddings.js";
import { SHOP_KNOWLEDGE_DOCUMENTS } from "../src/agents/shop-knowledge.js";
import type { EvalCase } from "./dataset.js";
import type { EvalRetriever } from "./offline-metrics.js";

// Evals embed with the same settings the API would use.
export const evalEmbeddingSettings = (): EmbeddingSettings => ({
  model: process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
  dimensions: Number(process.env.OPENAI_EMBEDDING_DIMENSIONS) || DEFAULT_EMBEDDING_DIMENSIONS,
});

// Everything the vector and hybrid evals need embedded: every note and every question.
export const textsToEmbed = (cases: readonly EvalCase[]) => [
  ...SHOP_KNOWLEDGE_DOCUMENTS.map(knowledgeEmbeddingText),
  ...cases.map(({ question }) => question),
];

const round = (value: number, places: number) => Number(value.toFixed(places));

// Builds vector-only and hybrid retrievers over the built-in notes, which the dataset targets.
export const createSemanticRetrievers = async (
  embed: Embed,
  minSimilarity = DEFAULT_MIN_SIMILARITY,
): Promise<{
  vector: EvalRetriever;
  hybrid: EvalRetriever;
  retrieveKnowledge: RetrieveKnowledge;
}> => {
  const { vectors } = await embed(SHOP_KNOWLEDGE_DOCUMENTS.map(knowledgeEmbeddingText));
  const candidates = SHOP_KNOWLEDGE_DOCUMENTS.map((document, index) => ({
    ...document,
    embedding: vectors[index]!,
  }));
  const retrieveKnowledge = createHybridRetriever({
    loadCandidates: async () => candidates,
    embed,
    minSimilarity,
  });

  return {
    retrieveKnowledge,
    vector: async (question) => {
      const [queryVector] = (await embed([question])).vectors;
      return (await searchVectorsInMemory(queryVector!, candidates, RETRIEVAL_LIMIT))
        .filter(({ similarity }) => similarity >= minSimilarity)
        .map(({ id, similarity }) => ({ id, score: round(similarity, 3) }));
    },
    hybrid: async (question) => {
      const result = await retrieveKnowledge(question);
      // A silent keyword fallback would make hybrid look identical to keyword search.
      if (result.mode !== "hybrid")
        throw new Error(result.fallbackReason ?? "Hybrid search failed.");
      return result.documents.map(({ document, fusedScore }) => ({
        id: document.id,
        score: round(fusedScore * 1000, 1),
      }));
    },
  };
};
