import { z } from "zod";

import { projectShopSummary } from "./shop-summary-tool.js";

const count = z.number().int().nonnegative();
const monthlySummarySchema = z.object({
  month: z.object({
    orderCount: count,
    salesTotal: count,
    itemsSold: count,
  }),
});
const ONGOING_STATUSES = ["PLACED", "CONFIRMED", "PREPARING", "READY"] as const;

export const projectShopAssistantSummary = (input: unknown) => {
  const summary = projectShopSummary(input);
  const result = monthlySummarySchema.safeParse(input);
  if (!result.success) {
    throw new Error("The shop returned an unexpected monthly report format.");
  }

  return {
    ...summary,
    ongoingOrders: {
      total: ONGOING_STATUSES.reduce(
        (total, status) => total + summary.ordersCreatedToday.currentStatusCounts[status],
        0,
      ),
      statusCounts: Object.fromEntries(
        ONGOING_STATUSES.map((status) => [
          status,
          summary.ordersCreatedToday.currentStatusCounts[status],
        ]),
      ),
    },
    completedSalesUpdatedThisMonth: {
      orderCount: result.data.month.orderCount,
      salesTotalPaise: result.data.month.salesTotal,
      salesTotalFormatted: new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(result.data.month.salesTotal / 100),
      itemsSold: result.data.month.itemsSold,
    },
  };
};

export type ShopAssistantSnapshot = ReturnType<typeof projectShopAssistantSummary>;
