import { createHybridRetriever, type RetrieveKnowledge } from "./hybrid-retrieval.js";
import type { Respond } from "./openai-responses.js";
import type { ShopAssistantSnapshot } from "./shop-assistant-summary.js";
import { SHOP_KNOWLEDGE_DOCUMENTS, type KnowledgeDocument } from "./shop-knowledge.js";
import type { ShopMenuSnapshot } from "./shop-menu-tool.js";

export interface AgentModelCallTrace {
  durationMs: number;
  ok: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  requestedTools: string[];
}

export interface AgentToolCallTrace {
  name: "get_shop_summary" | "get_shop_menu";
  durationMs: number;
  ok: boolean;
}

export interface AgentRetrievalTrace {
  mode: "hybrid" | "keyword";
  durationMs: number;
  embeddingTokens: number;
  fallbackReason: string | null;
}

export interface RetrievedKnowledgeTrace {
  id: string;
  fusedScore: number;
  // Null when that method did not nominate the note.
  keywordScore: number | null;
  similarity: number | null;
}

export interface AgentTrace {
  retrieval: AgentRetrievalTrace | null;
  retrievedKnowledge: RetrievedKnowledgeTrace[];
  modelCalls: AgentModelCallTrace[];
  toolCalls: AgentToolCallTrace[];
}

interface TraceableDependencies {
  respond: Respond;
  getShopSummary(): Promise<ShopAssistantSnapshot>;
  getShopMenu(): Promise<ShopMenuSnapshot>;
}

// Used by tests and evals that do not load notes from MongoDB.
export const keywordOnlyRetriever: RetrieveKnowledge = createHybridRetriever({
  loadCandidates: async () =>
    SHOP_KNOWLEDGE_DOCUMENTS.map((document) => ({ ...document, embedding: null })),
});

/**
 * Wraps each agent dependency so the run can be observed without changing the agent loop.
 * The returned trace is filled in place while the agent runs.
 */
export const traceShopAssistant = (
  { respond, getShopSummary, getShopMenu }: TraceableDependencies,
  {
    elapsed = () => performance.now(),
    retrieve = keywordOnlyRetriever,
  }: {
    elapsed?: () => number;
    retrieve?: RetrieveKnowledge;
  } = {},
) => {
  const trace: AgentTrace = {
    retrieval: null,
    retrievedKnowledge: [],
    modelCalls: [],
    toolCalls: [],
  };
  const durationSince = (start: number) => Math.max(0, Math.round(elapsed() - start));

  const traceTool =
    <T>(name: AgentToolCallTrace["name"], read: () => Promise<T>) =>
    async (): Promise<T> => {
      const start = elapsed();
      try {
        const result = await read();
        trace.toolCalls.push({ name, durationMs: durationSince(start), ok: true });
        return result;
      } catch (error) {
        trace.toolCalls.push({ name, durationMs: durationSince(start), ok: false });
        throw error;
      }
    };

  const tracedRespond: Respond = async (request) => {
    const start = elapsed();
    try {
      const response = await respond(request);
      trace.modelCalls.push({
        durationMs: durationSince(start),
        ok: true,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        requestedTools: response.output.flatMap((item) =>
          item.type === "function_call" && typeof item.name === "string" ? [item.name] : [],
        ),
      });
      return response;
    } catch (error) {
      trace.modelCalls.push({
        durationMs: durationSince(start),
        ok: false,
        inputTokens: null,
        outputTokens: null,
        requestedTools: [],
      });
      throw error;
    }
  };

  const retrieveKnowledge = async (question: string): Promise<KnowledgeDocument[]> => {
    const start = elapsed();
    const result = await retrieve(question);
    trace.retrieval = {
      mode: result.mode,
      durationMs: durationSince(start),
      embeddingTokens: result.embeddingTokens,
      fallbackReason: result.fallbackReason,
    };
    trace.retrievedKnowledge = result.documents.map(
      ({ document, fusedScore, keyword, vector }) => ({
        id: document.id,
        fusedScore,
        keywordScore: keyword?.score ?? null,
        similarity: vector?.similarity ?? null,
      }),
    );
    return result.documents.map(({ document }) => document);
  };

  return {
    trace,
    dependencies: {
      respond: tracedRespond,
      getShopSummary: traceTool("get_shop_summary", getShopSummary),
      getShopMenu: traceTool("get_shop_menu", getShopMenu),
      retrieveKnowledge,
    },
  };
};
