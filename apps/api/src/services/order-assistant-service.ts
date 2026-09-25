import { draftOrder, type OrderDraft } from "../agents/order-draft-agent.js";
import type { RespondStructured } from "../agents/openai-structured.js";
import { HttpError } from "../middleware/http-error.js";
import type { ProductService } from "./product-service.js";

const MENU_LIMIT = 100;

export interface OrderAssistantService {
  draft(message: string): Promise<OrderDraft>;
}

export const createOrderAssistantService = ({
  productService,
  extract,
  dailyLimit,
  timezone,
  now = () => new Date(),
}: {
  productService: Pick<ProductService, "listPublic">;
  // Absent when the feature is disabled or no API key is configured.
  extract?: RespondStructured | undefined;
  dailyLimit: number;
  timezone: string;
  now?: () => Date;
}): OrderAssistantService => {
  // A public endpoint spends API credits, so cap drafts per shop day. The count lives in
  // this process and resets on restart; it is a spending brake, not an exact quota.
  const dayOf = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
  let usage = { day: dayOf(now()), count: 0 };

  return {
    async draft(message) {
      if (!extract) {
        throw new HttpError(
          503,
          "ORDER_ASSISTANT_DISABLED",
          "Ordering by message is not available right now.",
        );
      }
      const today = dayOf(now());
      if (usage.day !== today) usage = { day: today, count: 0 };
      if (usage.count >= dailyLimit) {
        throw new HttpError(
          429,
          "ORDER_ASSISTANT_BUSY",
          "Ordering by message is busy today. Please add items from the menu.",
        );
      }
      usage.count += 1;

      const { items: menu } = await productService.listPublic({
        page: 1,
        limit: MENU_LIMIT,
        available: "all",
        sortBy: "name",
        sortOrder: "asc",
      });
      try {
        return await draftOrder(message, {
          menu,
          extract,
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        // Provider details never reach customers.
        throw new HttpError(
          503,
          "ORDER_ASSISTANT_UNAVAILABLE",
          "We couldn't read that order just now. Please try again or add items from the menu.",
        );
      }
    },
  };
};
