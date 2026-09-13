import { runShopAssistantAgent, type ShopAssistantSource } from "../agents/shop-assistant-agent.js";
import type { Respond } from "../agents/openai-responses.js";
import { projectShopAssistantSummary } from "../agents/shop-assistant-summary.js";
import { createShopMenuTool } from "../agents/shop-menu-tool.js";
import { HttpError } from "../middleware/http-error.js";
import { adminBriefQuestionSchema } from "../validation/admin-agent-schemas.js";
import type { ReportService } from "./report-service.js";
import type { ProductService } from "./product-service.js";

export interface AdminBriefing {
  answer: string;
  usedShopData: boolean;
  generatedAt: string;
  sources?: ShopAssistantSource[];
}

export interface AdminAgentService {
  getStatus(): { enabled: boolean };
  createBriefing(question: string): Promise<AdminBriefing>;
}

interface CreateAdminAgentServiceOptions {
  reportService: ReportService;
  productService: Pick<ProductService, "listPublic">;
  respond?: Respond;
  now?: () => Date;
}

export const createAdminAgentService = ({
  reportService,
  productService,
  respond,
  now = () => new Date(),
}: CreateAdminAgentServiceOptions): AdminAgentService => {
  // This shop uses one API process. Limit simultaneous paid runs across all admins.
  let inFlight = false;
  const getShopMenu = createShopMenuTool(productService, now);

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
        return await runShopAssistantAgent(parsed.data, {
          respond,
          getShopMenu,
          now,
          getShopSummary: async () => {
            const summary = await reportService.getSummary();
            return projectShopAssistantSummary({
              ...summary,
              generatedAt: summary.generatedAt.toISOString(),
            });
          },
        });
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
