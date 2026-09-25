import { OrderModel } from "../models/order-model.js";
import type { DailyVariantDemand } from "../services/prep-forecast.js";

export interface DemandRepository {
  // Units ordered per size per shop-local pickup date, for the given dates only.
  getDailyVariantDemand(dates: readonly string[], timezone: string): Promise<DailyVariantDemand[]>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class MongooseDemandRepository implements DemandRepository {
  public async getDailyVariantDemand(dates: readonly string[], timezone: string) {
    if (dates.length === 0) return [];
    const sorted = [...dates].sort();
    // A day of margin on each side covers every timezone offset; the exact shop-local date
    // is then computed by MongoDB and filtered below.
    const start = new Date(new Date(`${sorted[0]}T00:00:00.000Z`).getTime() - DAY_MS);
    const end = new Date(new Date(`${sorted.at(-1)}T00:00:00.000Z`).getTime() + 2 * DAY_MS);

    return OrderModel.aggregate<DailyVariantDemand>([
      // Demand is what customers asked for, so every order except cancelled ones counts.
      { $match: { status: { $ne: "CANCELLED" }, pickupTime: { $gte: start, $lt: end } } },
      {
        $set: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$pickupTime", timezone } },
        },
      },
      { $match: { date: { $in: [...dates] } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: { date: "$date", variantId: "$items.variantId" },
          productId: { $first: "$items.productId" },
          productName: { $first: "$items.productName" },
          variantName: { $first: "$items.variantName" },
          quantity: { $sum: "$items.quantity" },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id.date",
          variantId: { $toString: "$_id.variantId" },
          productId: { $toString: "$productId" },
          productName: 1,
          variantName: 1,
          quantity: 1,
        },
      },
    ]).exec();
  }
}
