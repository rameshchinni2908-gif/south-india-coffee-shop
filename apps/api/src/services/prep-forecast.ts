import type { ProductRecord } from "../types/catalog.js";

// Units a size was ordered for pickup on one shop-local date.
export interface DailyVariantDemand {
  date: string; // YYYY-MM-DD in the shop's timezone
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
}

export interface PrepForecastItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  // Same weekdays with any orders at all; days the shop had no orders are not counted as zero.
  daysCompared: number;
  averageUnits: number;
  highestUnits: number;
  suggestedPrep: number;
  stockQuantity: number;
  isAvailable: boolean;
  restockNeeded: number;
  lowConfidence: boolean;
}

export interface PrepForecast {
  date: string;
  weekday: string;
  weeksLookedBack: number;
  items: PrepForecastItem[];
}

export const PREP_WEEKS = 4;
// A small cushion above the average, so a normal busy day does not run out.
export const PREP_BUFFER = 0.1;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()]!;

// The earlier same weekdays this forecast compares, most recent first.
export const comparisonDates = (date: string, weeks = PREP_WEEKS) =>
  Array.from({ length: weeks }, (_, index) => shiftDate(date, -7 * (index + 1)));

/**
 * Deterministic arithmetic only. The language model later describes these numbers but never
 * calculates them, so the plan is reproducible and testable.
 */
export const buildPrepForecast = ({
  date,
  demand,
  products,
  weeks = PREP_WEEKS,
}: {
  date: string;
  demand: readonly DailyVariantDemand[];
  products: readonly ProductRecord[];
  weeks?: number;
}): PrepForecast => {
  const dates = comparisonDates(date, weeks);
  const tradingDates = dates.filter((day) => demand.some((row) => row.date === day));
  const variants = new Map(
    products.flatMap((product) =>
      product.variants.map((variant) => [variant.id, { product, variant }] as const),
    ),
  );

  const byVariant = new Map<string, DailyVariantDemand[]>();
  for (const row of demand) {
    if (!tradingDates.includes(row.date)) continue;
    byVariant.set(row.variantId, [...(byVariant.get(row.variantId) ?? []), row]);
  }

  const items = [...byVariant.entries()].flatMap(([variantId, rows]): PrepForecastItem[] => {
    // Sizes no longer on the menu (archived or removed) are not prepared.
    const current = variants.get(variantId);
    if (!current) return [];
    const unitsPerDay = tradingDates.map((day) =>
      rows.filter((row) => row.date === day).reduce((sum, row) => sum + row.quantity, 0),
    );
    const total = unitsPerDay.reduce((sum, units) => sum + units, 0);
    const averageUnits = Math.round((total / tradingDates.length) * 10) / 10;
    const suggestedPrep = Math.ceil(averageUnits * (1 + PREP_BUFFER));
    return [
      {
        productId: current.product.id,
        variantId,
        productName: current.product.name,
        variantName: current.variant.name,
        daysCompared: tradingDates.length,
        averageUnits,
        highestUnits: Math.max(...unitsPerDay),
        suggestedPrep,
        stockQuantity: current.variant.stockQuantity,
        isAvailable: current.variant.isAvailable,
        restockNeeded: Math.max(0, suggestedPrep - current.variant.stockQuantity),
        lowConfidence: tradingDates.length < 2,
      },
    ];
  });

  return {
    date,
    weekday: weekdayOf(date),
    weeksLookedBack: weeks,
    items: items.sort(
      (left, right) =>
        right.suggestedPrep - left.suggestedPrep ||
        left.productName.localeCompare(right.productName),
    ),
  };
};
