import { describe, expect, it } from "vitest";

import type { ReportRepository } from "../src/repositories/report-repository.js";
import { createReportService } from "../src/services/report-service.js";
import type {
  DateRange,
  LowStockOverview,
  LowStockVariant,
  OrderStatusCount,
  RecentPriceChange,
  SalesSummary,
} from "../src/types/report.js";

const NOW = new Date("2026-08-21T10:00:00.000Z");

class FakeReportRepository implements ReportRepository {
  public salesRanges: DateRange[] = [];

  public getSalesSummary(range: DateRange): Promise<SalesSummary> {
    this.salesRanges.push(range);

    return Promise.resolve(
      this.salesRanges.length === 1
        ? { orderCount: 3, salesTotal: 13_500, itemsSold: 5 }
        : { orderCount: 42, salesTotal: 189_000, itemsSold: 61 },
    );
  }

  public getOrderStatusCounts(_range: DateRange): Promise<OrderStatusCount[]> {
    return Promise.resolve([
      { status: "PLACED", count: 2 },
      { status: "READY", count: 1 },
      { status: "COMPLETED", count: 3 },
    ]);
  }

  public getLowStockOverview(_limit: number): Promise<LowStockOverview> {
    const variant: LowStockVariant = {
      productId: "507f1f77bcf86cd799439020",
      productName: "Filter Coffee",
      productSlug: "filter-coffee",
      variantId: "507f1f77bcf86cd799439021",
      variantName: "Regular",
      sku: "COFFEE-REG",
      stockQuantity: 2,
      lowStockThreshold: 5,
      isAvailable: true,
    };

    return Promise.resolve({ total: 1, variants: [variant] });
  }

  public listRecentPriceChanges(_limit: number): Promise<RecentPriceChange[]> {
    return Promise.resolve([
      {
        id: "507f1f77bcf86cd799439022",
        productId: "507f1f77bcf86cd799439020",
        productName: "Filter Coffee",
        variantId: "507f1f77bcf86cd799439021",
        variantSku: "COFFEE-REG",
        oldPrice: 4000,
        newPrice: 4500,
        changedBy: "507f1f77bcf86cd799439023",
        changedByName: "Admin User",
        changedAt: NOW,
      },
    ]);
  }
}

describe("report service", () => {
  it("builds daily and monthly summaries using Asia/Kolkata boundaries", async () => {
    const reportRepository = new FakeReportRepository();
    const service = createReportService({
      reportRepository,
      timezone: "Asia/Kolkata",
      now: () => NOW,
    });

    const summary = await service.getSummary();

    expect(reportRepository.salesRanges).toEqual([
      {
        start: new Date("2026-08-20T18:30:00.000Z"),
        end: new Date("2026-08-21T18:30:00.000Z"),
      },
      {
        start: new Date("2026-07-31T18:30:00.000Z"),
        end: new Date("2026-08-31T18:30:00.000Z"),
      },
    ]);
    expect(summary).toMatchObject({
      generatedAt: NOW,
      timezone: "Asia/Kolkata",
      today: {
        totalOrders: 6,
        orderCount: 3,
        salesTotal: 13_500,
        itemsSold: 5,
        statusCounts: {
          PLACED: 2,
          CONFIRMED: 0,
          PREPARING: 0,
          READY: 1,
          COMPLETED: 3,
          CANCELLED: 0,
        },
      },
      month: { orderCount: 42, salesTotal: 189_000, itemsSold: 61 },
      lowStockTotal: 1,
    });
    expect(summary.lowStockVariants).toHaveLength(1);
    expect(summary.recentPriceChanges).toHaveLength(1);
  });
});
