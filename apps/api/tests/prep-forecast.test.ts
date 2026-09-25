import { describe, expect, it } from "vitest";

import {
  buildPrepForecast,
  comparisonDates,
  weekdayOf,
  type DailyVariantDemand,
} from "../src/services/prep-forecast.js";
import type { ProductRecord } from "../src/types/catalog.js";

const product = (
  id: string,
  name: string,
  variants: [string, number, boolean][],
): ProductRecord => ({
  id,
  name,
  slug: id,
  description: "",
  categoryId: "category",
  imageUrl: "",
  isVegetarian: true,
  variants: variants.map(([variantId, stockQuantity, isAvailable]) => ({
    id: variantId,
    name: variantId.split("-")[1]!,
    sku: variantId.toUpperCase(),
    price: 3_000,
    stockQuantity,
    isAvailable,
  })),
  isActive: true,
  isArchived: false,
  archivedAt: null,
  archivedBy: null,
  lowStockThreshold: 5,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const PRODUCTS = [
  product("coffee", "Filter Coffee", [
    ["coffee-regular", 10, true],
    ["coffee-large", 40, false],
  ]),
  product("dosa", "Masala Dosa", [["dosa-regular", 30, true]]),
];
const row = (date: string, variantId: string, quantity: number): DailyVariantDemand => ({
  date,
  productId: variantId.split("-")[0]!,
  variantId,
  productName: "stored name",
  variantName: "stored size",
  quantity,
});

// 2026-09-24 is a Thursday; the comparison Thursdays are 17, 10, 3 September and 27 August.
const TODAY = "2026-09-24";

describe("prep forecast", () => {
  it("compares the same weekday over the previous four weeks", () => {
    expect(weekdayOf(TODAY)).toBe("Thursday");
    expect(comparisonDates(TODAY)).toEqual([
      "2026-09-17",
      "2026-09-10",
      "2026-09-03",
      "2026-08-27",
    ]);
  });

  it("averages demand, adds a buffer and compares it with live stock", () => {
    const forecast = buildPrepForecast({
      date: TODAY,
      products: PRODUCTS,
      demand: [
        row("2026-09-17", "coffee-regular", 20),
        row("2026-09-17", "coffee-regular", 4),
        row("2026-09-10", "coffee-regular", 16),
        row("2026-09-03", "coffee-regular", 20),
        row("2026-08-27", "coffee-regular", 18),
        row("2026-09-10", "dosa-regular", 6),
        // Other weekdays are ignored.
        row("2026-09-18", "dosa-regular", 50),
      ],
    });

    expect(forecast).toMatchObject({ date: TODAY, weekday: "Thursday", weeksLookedBack: 4 });
    expect(forecast.items).toEqual([
      {
        productId: "coffee",
        variantId: "coffee-regular",
        // Names come from the live catalogue, not the order snapshots.
        productName: "Filter Coffee",
        variantName: "regular",
        daysCompared: 4,
        averageUnits: 19.5,
        highestUnits: 24,
        suggestedPrep: 22,
        stockQuantity: 10,
        isAvailable: true,
        restockNeeded: 12,
        lowConfidence: false,
      },
      expect.objectContaining({
        variantId: "dosa-regular",
        // Sold only one Thursday of four: the other three count as zero.
        averageUnits: 1.5,
        highestUnits: 6,
        suggestedPrep: 2,
        restockNeeded: 0,
      }),
    ]);
  });

  it("does not count days without any orders, and flags thin history", () => {
    const forecast = buildPrepForecast({
      date: TODAY,
      products: PRODUCTS,
      demand: [row("2026-09-17", "coffee-large", 5)],
    });

    expect(forecast.items).toEqual([
      expect.objectContaining({
        variantId: "coffee-large",
        daysCompared: 1,
        averageUnits: 5,
        suggestedPrep: 6,
        isAvailable: false,
        lowConfidence: true,
      }),
    ]);
  });

  it("skips sizes that are no longer on the menu and handles no history", () => {
    expect(
      buildPrepForecast({
        date: TODAY,
        products: PRODUCTS,
        demand: [row("2026-09-17", "retired-regular", 9)],
      }).items,
    ).toEqual([]);
    expect(buildPrepForecast({ date: TODAY, products: PRODUCTS, demand: [] }).items).toEqual([]);
  });
});
