import { runAdminBriefAgent } from "../agents/admin-brief-agent.js";
import type { Respond } from "../agents/openai-responses.js";
import { projectShopSummary } from "../agents/shop-summary-tool.js";
import { HttpError } from "../middleware/http-error.js";
import { adminBriefQuestionSchema } from "../validation/admin-agent-schemas.js";
import type { ReportService } from "./report-service.js";

export interface AdminBriefing {
  answer: string;
  usedShopData: boolean;
  generatedAt: string;
}

export interface AdminAgentService {
  getStatus(): { enabled: boolean };
  createBriefing(question: string): Promise<AdminBriefing>;
}

interface CreateAdminAgentServiceOptions {
  reportService: ReportService;
  respond?: Respond;
  now?: () => Date;
}

export const createAdminAgentService = ({
  reportService,
  respond,
  now = () => new Date(),
}: CreateAdminAgentServiceOptions): AdminAgentService => {
  // This shop uses one API process. Limit simultaneous paid runs across all admins.
  let inFlight = false;

  return {
    getStatus: () => ({ enabled: Boolean(respond) }),
    async createBriefing(question) {
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
      try {
        let snapshotTime: string | undefined;
        const briefing = await runAdminBriefAgent(parsed.data, {
          respond,
          getShopSummary: async () => {
            const summary = await reportService.getSummary();
            const snapshot = projectShopSummary({
              ...summary,
              generatedAt: summary.generatedAt.toISOString(),
            });
            snapshotTime = snapshot.generatedAt;
            return snapshot;
          },
        });
        return { ...briefing, generatedAt: snapshotTime ?? now().toISOString() };
      } catch {
        // Do not propagate provider/database errors into HTTP responses or request logs.
        throw new HttpError(
          503,
          "AGENT_UNAVAILABLE",
          "The shop assistant could not complete the briefing. Please try again later.",
        );
      } finally {
        inFlight = false;
      }
    },
  };
};
