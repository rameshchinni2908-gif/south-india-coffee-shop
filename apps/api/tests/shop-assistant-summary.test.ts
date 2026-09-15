import { describe, expect, it } from "vitest";

import { projectShopAssistantSummary } from "../src/agents/shop-assistant-summary.js";
import { projectShopSummary } from "../src/agents/shop-summary-tool.js";

const report = () => ({
  generatedAt: "2026-09-13T08:00:00.000Z",
  timezone: "Asia/Kolkata",
  today: {
    totalOrders: 3,
    statusCounts: { PLACED: 1, CONFIRMED: 0, PREPARING: 0, READY: 0, COMPLETED: 1, CANCELLED: 1 },
    orderCount: 2,
    salesTotal: 4550,
    itemsSold: 4,
  },
  month: {
    orderCount: 30,
    salesTotal: 1234550,
    itemsSold: 80,
    privateMonthDetails: "private-customer-mobile",
  },
  lowStockTotal: 1,
  lowStockVariants: [
    {
      productId: "private-product-id",
      productName: "Filter Coffee",
      variantId: "private-variant-id",
      variantName: "Regular",
      sku: "private-sku",
      stockQuantity: 5,
      lowStockThreshold: 5,
      isAvailable: true,
    },
  ],
  recentPriceChanges: [{ changedBy: "private-staff-id" }],
  customerMobile: "private-customer-mobile",
});

describe("shop assistant monthly summary", () => {
  it("adds completed sales updated this month while preserving distinct daily order semantics", () => {
    const input = report();
    const snapshot = projectShopAssistantSummary(input);

    expect(snapshot).toEqual({
      ...projectShopSummary(input),
      ongoingOrders: {
        total: 1,
        statusCounts: { PLACED: 1, CONFIRMED: 0, PREPARING: 0, READY: 0 },
      },
      completedSalesUpdatedThisMonth: {
        orderCount: 30,
        salesTotalPaise: 1234550,
        salesTotalFormatted: "₹12,345.50",
        itemsSold: 80,
      },
    });
    expect(snapshot.ordersCreatedToday.total).toBe(3);
    expect(snapshot.ordersCreatedToday.currentStatusCounts.COMPLETED).toBe(1);
    expect(snapshot.ongoingOrders).toEqual({
      total: 1,
      statusCounts: { PLACED: 1, CONFIRMED: 0, PREPARING: 0, READY: 0 },
    });
    expect(snapshot.completedSalesUpdatedToday.orderCount).toBe(2);
    expect(projectShopSummary(input)).not.toHaveProperty("completedSalesUpdatedThisMonth");
    expect(JSON.stringify(snapshot)).not.toMatch(
      /private-|customerMobile|recentPriceChanges|sku|profit/,
    );
  });

  it("represents a month without completed sales as zero INR", () => {
    const input = report();
    input.month = { ...input.month, orderCount: 0, salesTotal: 0, itemsSold: 0 };

    expect(projectShopAssistantSummary(input).completedSalesUpdatedThisMonth).toEqual({
      orderCount: 0,
      salesTotalPaise: 0,
      salesTotalFormatted: "₹0.00",
      itemsSold: 0,
    });
  });

  it.each([
    undefined,
    null,
    {},
    { orderCount: 1, salesTotal: "private-value", itemsSold: 1 },
    { orderCount: -1, salesTotal: 0, itemsSold: 0 },
    { orderCount: 0, salesTotal: -1, itemsSold: 0 },
    { orderCount: 0, salesTotal: 1.5, itemsSold: 0 },
    { orderCount: 0, salesTotal: 0, itemsSold: 1.5 },
    { orderCount: 0, salesTotal: Infinity, itemsSold: 0 },
  ])("requires valid monthly counts and integer paise without echoing bad data", (month) => {
    expect(() => projectShopAssistantSummary({ ...report(), month })).toThrow(
      "The shop returned an unexpected monthly report format.",
    );
  });

  it("retains validation of the original daily report", () => {
    expect(() => projectShopAssistantSummary({ ...report(), generatedAt: "not a date" })).toThrow(
      "The shop returned an unexpected report format.",
    );
  });
});
