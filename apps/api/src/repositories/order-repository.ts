import { Types } from "mongoose";

import { OrderModel } from "../models/order-model.js";
import type { NewOrderRecord, OrderRecord } from "../types/order.js";

export interface OrderRepository {
  create(order: NewOrderRecord): Promise<OrderRecord>;
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
}
