import { Types, type QueryFilter, type SortOrder } from "mongoose";

import { OrderModel } from "../models/order-model.js";
import { ProductModel } from "../models/product-model.js";
import type {
  NewOrderRecord,
  OrderListFilters,
  OrderListResult,
  OrderRecord,
  OrderStatus,
} from "../types/order.js";
import { escapeRegExp } from "../utils/regex.js";

export type TransactionalOrderResult =
  { kind: "updated"; order: OrderRecord } | { kind: "conflict" } | { kind: "insufficient-stock" };

export interface OrderRepository {
  create(order: NewOrderRecord): Promise<OrderRecord>;
  list(filters: OrderListFilters): Promise<OrderListResult>;
  findById(id: string): Promise<OrderRecord | null>;
  findByTracking(orderNumber: string, customerMobile: string): Promise<OrderRecord | null>;
  updateStatus(
    id: string,
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
  ): Promise<OrderRecord | null>;
  confirm(id: string): Promise<TransactionalOrderResult>;
  cancelConfirmed(id: string): Promise<TransactionalOrderResult>;
}

const toOrderRecord = (order: InstanceType<typeof OrderModel>): OrderRecord => ({
  id: order._id.toString(),
  orderNumber: order.orderNumber,
  customerName: order.customerName,
  customerMobile: order.customerMobile,
  items: order.items.map((item) => ({
    productId: item.productId.toString(),
    variantId: item.variantId.toString(),
    productName: item.productName,
    variantName: item.variantName,
    sku: item.sku,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    lineTotal: item.lineTotal,
  })),
  subtotal: order.subtotal,
  taxAmount: order.taxAmount,
  totalAmount: order.totalAmount,
  paymentMethod: order.paymentMethod,
  paymentStatus: order.paymentStatus,
  status: order.status,
  pickupTime: order.pickupTime,
  notes: order.notes,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

export class MongooseOrderRepository implements OrderRepository {
  public async create(order: NewOrderRecord): Promise<OrderRecord> {
    const createdOrder = await OrderModel.create({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        productId: new Types.ObjectId(item.productId),
        variantId: new Types.ObjectId(item.variantId),
      })),
    });

    return toOrderRecord(createdOrder);
  }

  public async list(filters: OrderListFilters): Promise<OrderListResult> {
    const query: QueryFilter<InstanceType<typeof OrderModel>> = {};

    if (filters.search) {
      const expression = { $regex: escapeRegExp(filters.search), $options: "i" };
      query.$or = [
        { orderNumber: expression },
        { customerName: expression },
        { customerMobile: expression },
      ];
    }

    if (filters.status) {
      query.status = filters.status;
    }

    const skip = (filters.page - 1) * filters.limit;
    const direction: SortOrder = filters.sortOrder === "asc" ? 1 : -1;
    const [orders, total] = await Promise.all([
      OrderModel.find(query)
        .sort({ [filters.sortBy]: direction })
        .skip(skip)
        .limit(filters.limit)
        .exec(),
      OrderModel.countDocuments(query).exec(),
    ]);

    return {
      items: orders.map(toOrderRecord),
      meta: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  public async findById(id: string): Promise<OrderRecord | null> {
    const order = await OrderModel.findById(id).exec();

    return order ? toOrderRecord(order) : null;
  }

  public async findByTracking(
    orderNumber: string,
    customerMobile: string,
  ): Promise<OrderRecord | null> {
    const order = await OrderModel.findOne({ orderNumber, customerMobile }).exec();

    return order ? toOrderRecord(order) : null;
  }

  public async updateStatus(
    id: string,
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
  ): Promise<OrderRecord | null> {
    const update: { status: OrderStatus; paymentStatus?: "PAID" } = { status: nextStatus };

    if (nextStatus === "COMPLETED") {
      update.paymentStatus = "PAID";
    }

    const order = await OrderModel.findOneAndUpdate({ _id: id, status: expectedStatus }, update, {
      new: true,
      runValidators: true,
    }).exec();

    return order ? toOrderRecord(order) : null;
  }

  public confirm(id: string): Promise<TransactionalOrderResult> {
    return this.updateStockAndStatus(id, "PLACED", "CONFIRMED", -1);
  }

  public cancelConfirmed(id: string): Promise<TransactionalOrderResult> {
    return this.updateStockAndStatus(id, "CONFIRMED", "CANCELLED", 1);
  }

  private async updateStockAndStatus(
    id: string,
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
    stockDirection: -1 | 1,
  ): Promise<TransactionalOrderResult> {
    const session = await OrderModel.startSession();
    let result: TransactionalOrderResult = { kind: "conflict" };

    try {
      await session.withTransaction(async () => {
        const order = await OrderModel.findOne({ _id: id, status: expectedStatus })
          .session(session)
          .exec();

        if (!order) {
          result = { kind: "conflict" };
          return;
        }

        for (const item of order.items) {
          const variantFilter: Record<string, unknown> = { _id: item.variantId };

          if (stockDirection === -1) {
            variantFilter.isAvailable = true;
            variantFilter.stockQuantity = { $gte: item.quantity };
          }

          const stockUpdate = await ProductModel.updateOne(
            {
              _id: item.productId,
              ...(stockDirection === -1 ? { isActive: true, isArchived: false } : {}),
              variants: { $elemMatch: variantFilter },
            },
            { $inc: { "variants.$[variant].stockQuantity": stockDirection * item.quantity } },
            {
              arrayFilters: [{ "variant._id": item.variantId }],
              session,
            },
          ).exec();

          if (stockUpdate.modifiedCount !== 1) {
            result = { kind: "insufficient-stock" };
            throw new Error("ORDER_STOCK_UPDATE_FAILED");
          }
        }

        order.status = nextStatus;
        await order.save({ session });
        result = { kind: "updated", order: toOrderRecord(order) };
      });
    } catch (error) {
      if (!(error instanceof Error && error.message === "ORDER_STOCK_UPDATE_FAILED")) {
        throw error;
      }
    } finally {
      await session.endSession();
    }

    return result;
  }
}
