import { Types, type ClientSession, type QueryFilter, type SortOrder } from "mongoose";

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

export type CreateOrderResult =
  { kind: "created"; order: OrderRecord } | { kind: "insufficient-stock" };

export interface OrderRepository {
  /** Creates the order and reserves its stock in one transaction. */
  create(order: NewOrderRecord): Promise<CreateOrderResult>;
  list(filters: OrderListFilters): Promise<OrderListResult>;
  findById(id: string): Promise<OrderRecord | null>;
  findByTracking(orderNumber: string, customerMobile: string): Promise<OrderRecord | null>;
  updateStatus(
    id: string,
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
  ): Promise<OrderRecord | null>;
  confirm(id: string): Promise<TransactionalOrderResult>;
  /** Cancels a PLACED or CONFIRMED order and releases any stock it holds. */
  cancel(id: string, expectedStatus: OrderStatus): Promise<TransactionalOrderResult>;
}

type OrderDocument = InstanceType<typeof OrderModel>;
type OrderItemDocument = OrderDocument["items"][number];
type StockDirection = -1 | 1;

const STOCK_UPDATE_FAILED = "ORDER_STOCK_UPDATE_FAILED";

// Orders created before stock reservation have no stockReserved flag: they took stock only
// on confirmation, so a legacy PLACED order holds none and later statuses hold theirs.
const holdsStock = (order: OrderDocument): boolean =>
  order.stockReserved ?? order.status !== "PLACED";

const toOrderRecord = (order: OrderDocument): OrderRecord => ({
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
  public async create(order: NewOrderRecord): Promise<CreateOrderResult> {
    const session = await OrderModel.startSession();
    let result: CreateOrderResult = { kind: "insufficient-stock" };

    try {
      await session.withTransaction(async () => {
        const [createdOrder] = await OrderModel.create(
          [
            {
              ...order,
              items: order.items.map((item) => ({
                ...item,
                productId: new Types.ObjectId(item.productId),
                variantId: new Types.ObjectId(item.variantId),
              })),
              stockReserved: true,
            },
          ],
          { session },
        );

        if (!createdOrder) {
          throw new Error("Order was not created");
        }

        await adjustStock(createdOrder.items, -1, session);
        result = { kind: "created", order: toOrderRecord(createdOrder) };
      });
    } catch (error) {
      if (!isStockUpdateFailure(error)) {
        throw error;
      }
      result = { kind: "insufficient-stock" };
    } finally {
      await session.endSession();
    }

    return result;
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
    return this.changeStatusInTransaction(id, "PLACED", "CONFIRMED", async (order, session) => {
      if (!holdsStock(order)) {
        await adjustStock(order.items, -1, session);
      }
      order.stockReserved = true;
    });
  }

  public cancel(id: string, expectedStatus: OrderStatus): Promise<TransactionalOrderResult> {
    return this.changeStatusInTransaction(
      id,
      expectedStatus,
      "CANCELLED",
      async (order, session) => {
        if (holdsStock(order)) {
          await adjustStock(order.items, 1, session);
        }
        order.stockReserved = false;
      },
    );
  }

  private async changeStatusInTransaction(
    id: string,
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
    updateStock: (order: OrderDocument, session: ClientSession) => Promise<void>,
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

        await updateStock(order, session);
        order.status = nextStatus;
        await order.save({ session });
        result = { kind: "updated", order: toOrderRecord(order) };
      });
    } catch (error) {
      if (!isStockUpdateFailure(error)) {
        throw error;
      }
      result = { kind: "insufficient-stock" };
    } finally {
      await session.endSession();
    }

    return result;
  }
}

const isStockUpdateFailure = (error: unknown): boolean =>
  error instanceof Error && error.message === STOCK_UPDATE_FAILED;

/**
 * Moves each item's quantity in or out of its variant's stock. Taking stock requires an
 * orderable variant with enough units, so stock can never become negative; a failed item
 * throws so the surrounding transaction rolls back every earlier change.
 */
const adjustStock = async (
  items: readonly OrderItemDocument[],
  direction: StockDirection,
  session: ClientSession,
): Promise<void> => {
  for (const item of items) {
    const isTaking = direction === -1;
    const variantFilter: Record<string, unknown> = { _id: item.variantId };

    if (isTaking) {
      variantFilter.isAvailable = true;
      variantFilter.stockQuantity = { $gte: item.quantity };
    }

    const stockUpdate = await ProductModel.updateOne(
      {
        _id: item.productId,
        ...(isTaking ? { isActive: true, isArchived: false } : {}),
        variants: { $elemMatch: variantFilter },
      },
      { $inc: { "variants.$[variant].stockQuantity": direction * item.quantity } },
      { arrayFilters: [{ "variant._id": item.variantId }], session },
    ).exec();

    if (stockUpdate.modifiedCount !== 1) {
      throw new Error(STOCK_UPDATE_FAILED);
    }
  }
};
