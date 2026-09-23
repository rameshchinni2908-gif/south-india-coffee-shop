import type { Embed } from "./openai-embeddings.js";
import { rankShopKnowledge } from "./shop-knowledge-retrieval.js";
import type { KnowledgeDocument } from "./shop-knowledge.js";

// Final number of notes given to the model.
export const RETRIEVAL_LIMIT = 4;
// Each method nominates more candidates than the final limit so fusion has something to fuse.
const CANDIDATES_PER_METHOD = 8;
// Standard Reciprocal Rank Fusion constant. Larger values flatten the gap between ranks.
export const RRF_K = 60;
// Below this cosine similarity a note is treated as unrelated. Tune it with `npm run eval`.
export const DEFAULT_MIN_SIMILARITY = 0.3;

export interface KnowledgeCandidate extends KnowledgeDocument {
  // Null when the note has no embedding for its current text (missing or stale).
  embedding: readonly number[] | null;
}

export interface VectorMatch {
  id: string;
  similarity: number;
}

// Returns candidate IDs ordered by cosine similarity to the query, best first.
export type VectorSearch = (
  queryVector: readonly number[],
  candidates: readonly KnowledgeCandidate[],
  limit: number,
) => Promise<VectorMatch[]>;

export interface RetrievedKnowledge {
  document: KnowledgeDocument;
  fusedScore: number;
  keyword: { rank: number; score: number } | null;
  vector: { rank: number; similarity: number } | null;
}

export interface RetrievalResult {
  mode: "hybrid" | "keyword";
  documents: RetrievedKnowledge[];
  embeddingTokens: number;
  // Why hybrid search was not used, when it was expected.
  fallbackReason: string | null;
}

export type RetrieveKnowledge = (question: string) => Promise<RetrievalResult>;

export const cosineSimilarity = (left: readonly number[], right: readonly number[]): number => {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! ** 2;
    rightNorm += right[index]! ** 2;
  }
  return leftNorm === 0 || rightNorm === 0 ? 0 : dot / Math.sqrt(leftNorm * rightNorm);
};

// Exact nearest-neighbour search. For tens or hundreds of notes this is faster than a network
// round trip to a vector index, and it works on any MongoDB deployment.
export const searchVectorsInMemory: VectorSearch = async (queryVector, candidates, limit) =>
  candidates
    .flatMap((candidate) =>
      candidate.embedding
        ? [{ id: candidate.id, similarity: cosineSimilarity(queryVector, candidate.embedding) }]
        : [],
    )
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit);

/**
 * Reciprocal Rank Fusion: each list contributes 1 / (k + rank) for every document it ranks.
 * It combines lists whose raw scores are not comparable (keyword points vs cosine similarity)
 * using only positions, and rewards documents that both methods agree on.
 */
export const fuseRankings = (
  rankings: readonly (readonly string[])[],
  k = RRF_K,
): Map<string, number> => {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return scores;
};

export const createHybridRetriever =
  ({
    loadCandidates,
    embed,
    searchVectors = searchVectorsInMemory,
    minSimilarity = DEFAULT_MIN_SIMILARITY,
    limit = RETRIEVAL_LIMIT,
  }: {
    loadCandidates(): Promise<KnowledgeCandidate[]>;
    // Without an embedder the retriever runs keyword-only, exactly like the original assistant.
    embed?: Embed | undefined;
    searchVectors?: VectorSearch;
    minSimilarity?: number;
    limit?: number;
  }): RetrieveKnowledge =>
  async (question) => {
    const candidates = await loadCandidates();
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const keywordRanking = rankShopKnowledge(question, candidates, CANDIDATES_PER_METHOD);

    let vectorRanking: VectorMatch[] = [];
    let embeddingTokens = 0;
    let fallbackReason: string | null = null;
    if (!embed) {
      fallbackReason = "Embeddings are not configured.";
    } else {
      try {
        const { vectors, tokens } = await embed([question.slice(0, 2_000)]);
        embeddingTokens = tokens;
        vectorRanking = (
          await searchVectors(vectors[0]!, candidates, CANDIDATES_PER_METHOD)
        ).filter(({ id, similarity }) => byId.has(id) && similarity >= minSimilarity);
      } catch {
        // Retrieval degrades to keywords rather than failing the admin's question.
        fallbackReason = "Vector search failed; keyword results were used.";
      }
    }

    const keywordIds = keywordRanking.map(({ document }) => document.id);
    const vectorIds = vectorRanking.map(({ id }) => id);
    const fused = fuseRankings([keywordIds, vectorIds]);
    const documents = [...fused.entries()]
      .map(([id, fusedScore]): RetrievedKnowledge => {
        const keywordIndex = keywordIds.indexOf(id);
        const vectorIndex = vectorIds.indexOf(id);
        const { title, content, keywords } = byId.get(id)!;
        return {
          // Plain documents only: vectors never reach the model.
          document: { id, title, content, keywords },
          fusedScore,
          keyword:
            keywordIndex === -1
              ? null
              : { rank: keywordIndex + 1, score: keywordRanking[keywordIndex]!.score },
          vector:
            vectorIndex === -1
              ? null
              : { rank: vectorIndex + 1, similarity: vectorRanking[vectorIndex]!.similarity },
        };
      })
      .sort(
        (left, right) =>
          right.fusedScore - left.fusedScore ||
          // On a tie, prefer the curated keyword match, then the closer vector match.
          (left.keyword?.rank ?? Infinity) - (right.keyword?.rank ?? Infinity) ||
          (left.vector?.rank ?? Infinity) - (right.vector?.rank ?? Infinity),
      )
      .slice(0, limit);

    return {
      mode: fallbackReason ? "keyword" : "hybrid",
      documents,
      embeddingTokens,
      fallbackReason,
    };
  };
