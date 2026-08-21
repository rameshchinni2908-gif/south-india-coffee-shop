import { OrderModel } from "../models/order-model.js";
import { PriceHistoryModel } from "../models/price-history-model.js";
import { ProductModel } from "../models/product-model.js";
import { UserModel } from "../models/user-model.js";
import type {
  DateRange,
  LowStockOverview,
  LowStockVariant,
  OrderStatusCount,
  RecentPriceChange,
  SalesSummary,
} from "../types/report.js";

export interface ReportRepository {
  getSalesSummary(range: DateRange): Promise<SalesSummary>;
  getOrderStatusCounts(range: DateRange): Promise<OrderStatusCount[]>;
  getLowStockOverview(limit: number): Promise<LowStockOverview>;
  listRecentPriceChanges(limit: number): Promise<RecentPriceChange[]>;
}

export class MongooseReportRepository implements ReportRepository {
  public async getSalesSummary(range: DateRange): Promise<SalesSummary> {
    const [summary] = await OrderModel.aggregate<SalesSummary>([
      {
        $match: {
          status: "COMPLETED",
          updatedAt: { $gte: range.start, $lt: range.end },
        },
      },
      { $set: { itemCount: { $sum: "$items.quantity" } } },
      {
        $group: {
          _id: null,
          orderCount: { $sum: 1 },
          salesTotal: { $sum: "$totalAmount" },
          itemsSold: { $sum: "$itemCount" },
        },
      },
      { $project: { _id: 0, orderCount: 1, salesTotal: 1, itemsSold: 1 } },
    ]).exec();

    return summary ?? { orderCount: 0, salesTotal: 0, itemsSold: 0 };
  }

  public getOrderStatusCounts(range: DateRange): Promise<OrderStatusCount[]> {
    return OrderModel.aggregate<OrderStatusCount>([
      { $match: { createdAt: { $gte: range.start, $lt: range.end } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $project: { _id: 0, status: "$_id", count: 1 } },
    ]).exec();
  }

  public async getLowStockOverview(limit: number): Promise<LowStockOverview> {
    const [overview] = await ProductModel.aggregate<{
      variants: LowStockVariant[];
      totals: Array<{ total: number }>;
    }>([
      { $match: { isActive: true, isArchived: false } },
      { $unwind: "$variants" },
      {
        $match: {
          $expr: { $lte: ["$variants.stockQuantity", "$lowStockThreshold"] },
        },
      },
      {
        $facet: {
          variants: [
            { $sort: { "variants.stockQuantity": 1, name: 1, "variants.name": 1 } },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                productId: { $toString: "$_id" },
                productName: "$name",
                productSlug: "$slug",
                variantId: { $toString: "$variants._id" },
                variantName: "$variants.name",
                sku: "$variants.sku",
                stockQuantity: "$variants.stockQuantity",
                lowStockThreshold: "$lowStockThreshold",
                isAvailable: "$variants.isAvailable",
              },
            },
          ],
          totals: [{ $count: "total" }],
        },
      },
    ]).exec();

    return {
      total: overview?.totals[0]?.total ?? 0,
      variants: overview?.variants ?? [],
    };
  }

  public listRecentPriceChanges(limit: number): Promise<RecentPriceChange[]> {
    return PriceHistoryModel.aggregate<RecentPriceChange>([
      { $sort: { changedAt: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: ProductModel.collection.name,
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      {
        $lookup: {
          from: UserModel.collection.name,
          localField: "changedBy",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $project: {
          _id: 0,
          id: { $toString: "$_id" },
          productId: { $toString: "$productId" },
          productName: {
            $ifNull: [{ $arrayElemAt: ["$product.name", 0] }, "Archived product"],
          },
          variantId: { $toString: "$variantId" },
          variantSku: 1,
          oldPrice: 1,
          newPrice: 1,
          changedBy: { $toString: "$changedBy" },
          changedByName: {
            $ifNull: [{ $arrayElemAt: ["$user.name", 0] }, "Staff user"],
          },
          changedAt: 1,
        },
      },
    ]).exec();
  }
}
