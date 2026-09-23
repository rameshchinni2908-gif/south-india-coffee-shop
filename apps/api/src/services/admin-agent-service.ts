import { traceShopAssistant, type AgentTrace } from "../agents/agent-trace.js";
import type { RetrieveKnowledge } from "../agents/hybrid-retrieval.js";
import { runShopAssistantAgent, type ShopAssistantSource } from "../agents/shop-assistant-agent.js";
import type { Respond } from "../agents/openai-responses.js";
import { projectShopAssistantSummary } from "../agents/shop-assistant-summary.js";
import { createShopMenuTool } from "../agents/shop-menu-tool.js";
import { HttpError } from "../middleware/http-error.js";
import type { AgentRunRepository } from "../repositories/agent-run-repository.js";
import type {
  AgentRunFilters,
  AgentRunOutcome,
  AgentRunRating,
  AgentRunRecord,
} from "../types/agent-run.js";
import { adminBriefQuestionSchema } from "../validation/admin-agent-schemas.js";
import type { ReportService } from "./report-service.js";
import type { ProductService } from "./product-service.js";

export interface AdminBriefing {
  answer: string;
  usedShopData: boolean;
  generatedAt: string;
  sources?: ShopAssistantSource[];
  // Present when the run was saved to the run log, so the admin can rate it.
  runId?: string;
}

export interface AdminAgentService {
  getStatus(): { enabled: boolean };
  createBriefing(question: string, adminId: string): Promise<AdminBriefing>;
  listRuns(filters: AgentRunFilters): Promise<AgentRunRecord[]>;
  rateRun(
    id: string,
    adminId: string,
    feedback: { rating: AgentRunRating; comment: string | null },
  ): Promise<AgentRunRecord>;
}

interface CreateAdminAgentServiceOptions {
  reportService: ReportService;
  productService: Pick<ProductService, "listPublic">;
  respond?: Respond;
  agentRunRepository?: AgentRunRepository;
  // Defaults to keyword search over the built-in notes.
  retrieveKnowledge?: RetrieveKnowledge;
  model?: string;
  now?: () => Date;
  elapsed?: () => number;
}

// Tool errors can carry raw database text, so only the agent's own messages are stored.
const describeFailure = (error: unknown, trace: AgentTrace): string =>
  trace.toolCalls.some((call) => !call.ok)
    ? "A live shop tool failed."
    : error instanceof Error
      ? error.message.slice(0, 300)
      : "Unknown failure.";

export const createAdminAgentService = ({
  reportService,
  productService,
  respond,
  agentRunRepository,
  retrieveKnowledge,
  model,
  now = () => new Date(),
  elapsed = () => performance.now(),
}: CreateAdminAgentServiceOptions): AdminAgentService => {
  // This shop uses one API process. Limit simultaneous paid runs across all admins.
  let inFlight = false;
  const getShopMenu = createShopMenuTool(productService, now);
  const requireRunLog = () => {
    if (!agentRunRepository) {
      throw new HttpError(503, "AGENT_RUN_LOG_NOT_CONFIGURED", "The agent run log is not enabled.");
    }
    return agentRunRepository;
  };

  return {
    getStatus: () => ({ enabled: Boolean(respond) }),
    async createBriefing(question, adminId) {
      const parsed = adminBriefQuestionSchema.safeParse(question);
      if (!parsed.success) {
        throw new HttpError(
          400,
          "VALIDATION_ERROR",
          "Ask a question between 1 and 500 characters.",
        );
      }
      if (!respond) {
        throw new HttpError(
          503,
          "AGENT_NOT_CONFIGURED",
          "The shop assistant is not configured yet.",
        );
      }
      if (inFlight) {
        throw new HttpError(
          429,
          "AGENT_BUSY",
          "A briefing is already running. Please try again shortly.",
        );
      }

      inFlight = true;
      const createdAt = now();
      const startedAt = elapsed();
      const { trace, dependencies } = traceShopAssistant(
        {
          respond,
          getShopMenu,
          getShopSummary: async () => {
            const summary = await reportService.getSummary();
            return projectShopAssistantSummary({
              ...summary,
              generatedAt: summary.generatedAt.toISOString(),
            });
          },
        },
        { elapsed, ...(retrieveKnowledge ? { retrieve: retrieveKnowledge } : {}) },
      );
      try {
        let briefing: Awaited<ReturnType<typeof runShopAssistantAgent>> | undefined;
        let failure: unknown;
        try {
          briefing = await runShopAssistantAgent(parsed.data, { ...dependencies, now });
        } catch (error) {
          failure = error;
        }

        let runId: string | undefined;
        if (agentRunRepository) {
          // A guardrail refusal finishes before any model request.
          const outcome: AgentRunOutcome = !briefing
            ? "FAILED"
            : trace.modelCalls.length === 0
              ? "BLOCKED"
              : "ANSWERED";
          try {
            runId = await agentRunRepository.create({
              adminId,
              question: parsed.data,
              outcome,
              answer: briefing?.answer ?? null,
              failureReason: briefing ? null : describeFailure(failure, trace),
              sourceIds: briefing?.sources.map((source) => source.id) ?? [],
              model: model ?? null,
              totalDurationMs: Math.max(0, Math.round(elapsed() - startedAt)),
              inputTokens: trace.modelCalls.reduce((sum, call) => sum + (call.inputTokens ?? 0), 0),
              outputTokens: trace.modelCalls.reduce(
                (sum, call) => sum + (call.outputTokens ?? 0),
                0,
              ),
              trace,
              createdAt,
            });
          } catch {
            // The run log is diagnostic; losing one entry must not hide a paid answer.
          }
        }

        if (!briefing) {
          // Do not propagate provider/database errors into HTTP responses or request logs.
          throw new HttpError(
            503,
            "AGENT_UNAVAILABLE",
            "The shop assistant could not complete the briefing. Please try again later.",
          );
        }
        return runId ? { ...briefing, runId } : briefing;
      } finally {
        inFlight = false;
      }
    },
    listRuns: async (filters) => requireRunLog().list(filters),
    async rateRun(id, adminId, { rating, comment }) {
      const run = await requireRunLog().setFeedback(id, adminId, {
        rating,
        comment,
        ratedAt: now(),
      });
      if (!run) {
        throw new HttpError(404, "AGENT_RUN_NOT_FOUND", "That assistant answer was not found.");
      }
      return run;
    },
  };
};
