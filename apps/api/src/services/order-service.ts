import { randomBytes } from "node:crypto";

import { HttpError } from "../middleware/http-error.js";
import type { CategoryRepository } from "../repositories/category-repository.js";
import type { OrderRepository } from "../repositories/order-repository.js";
import type { ProductRepository } from "../repositories/product-repository.js";
import type {
  NewOrderRecord,
  OrderItemRecord,
  OrderListResult,
  OrderRecord,
  OrderStatus,
} from "../types/order.js";
import type {
  AdminOrderQuery,
  CreateOrderInput,
  TrackOrderInput,
  UpdateOrderStatusInput,
} from "../validation/order-schemas.js";

export interface OrderService {
  create(input: CreateOrderInput): Promise<OrderRecord>;
  track(input: TrackOrderInput): Promise<OrderRecord>;
  list(query: AdminOrderQuery): Promise<OrderListResult>;
  updateStatus(id: string, input: UpdateOrderStatusInput): Promise<OrderRecord>;
}

interface CreateOrderServiceOptions {
  orderRepository: OrderRepository;
  productRepository: ProductRepository;
  categoryRepository: CategoryRepository;
  taxPercentage: number;
  now?: () => Date;
  generateOrderNumber?: (now: Date) => string;
}

const defaultOrderNumber = (now: Date): string => {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomBytes(3).toString("hex").toUpperCase();

  return `SIC-${date}-${suffix}`;
};

const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const createOrderService = ({
  orderRepository,
  productRepository,
  categoryRepository,
  taxPercentage,
  now = () => new Date(),
  generateOrderNumber = defaultOrderNumber,
}: CreateOrderServiceOptions): OrderService => ({
  async create(input) {
    const createdAt = now();
    const pickupTime = new Date(input.pickupTime);

    if (pickupTime.getTime() <= createdAt.getTime()) {
      throw new HttpError(400, "INVALID_PICKUP_TIME", "Pickup time must be in the future");
    }

    const activeCategoryIds = await categoryRepository.listActiveIds();
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await productRepository.findOrderableByIds(productIds, activeCategoryIds);
    const productsById = new Map(products.map((product) => [product.id, product]));

    const items: OrderItemRecord[] = input.items.map((requestedItem) => {
      const product = productsById.get(requestedItem.productId);

      if (!product) {
        throw new HttpError(
          409,
          "PRODUCT_UNAVAILABLE",
          "A selected product is no longer available",
        );
      }

      const variant = product.variants.find(
        (candidate) => candidate.id === requestedItem.variantId,
      );

      if (!variant || !variant.isAvailable || variant.stockQuantity === 0) {
        throw new HttpError(
          409,
          "VARIANT_UNAVAILABLE",
          "A selected product option is no longer available",
        );
      }

      if (requestedItem.quantity > variant.stockQuantity) {
        throw new HttpError(
          409,
          "INSUFFICIENT_STOCK",
          `Only ${variant.stockQuantity} unit(s) of ${product.name} ${variant.name} are available`,
        );
      }

      return {
        productId: product.id,
        variantId: variant.id,
        productName: product.name,
        variantName: variant.name,
        sku: variant.sku,
        unitPrice: variant.price,
        quantity: requestedItem.quantity,
        lineTotal: variant.price * requestedItem.quantity,
      };
    });
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const taxAmount = Math.round((subtotal * taxPercentage) / 100);
    const order: NewOrderRecord = {
      orderNumber: generateOrderNumber(createdAt),
      customerName: input.customerName,
      customerMobile: input.customerMobile,
      items,
      subtotal,
      taxAmount,
      totalAmount: subtotal + taxAmount,
      paymentMethod: "PAY_AT_SHOP",
      paymentStatus: "PENDING",
      status: "PLACED",
      pickupTime,
      notes: input.notes,
    };

    return orderRepository.create(order);
  },

  async track(input) {
    const order = await orderRepository.findByTracking(input.orderNumber, input.customerMobile);

    if (!order) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "No matching order was found");
    }

    return order;
  },

  list(query) {
    return orderRepository.list({
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      ...(query.search !== undefined ? { search: query.search } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
  },

  async updateStatus(id, input) {
    const currentOrder = await orderRepository.findById(id);

    if (!currentOrder) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "Order was not found");
    }

    if (!ALLOWED_TRANSITIONS[currentOrder.status].includes(input.status)) {
      throw new HttpError(
        409,
        "INVALID_ORDER_STATUS_TRANSITION",
        `Order cannot move from ${currentOrder.status} to ${input.status}`,
      );
    }

    if (currentOrder.status === "PLACED" && input.status === "CONFIRMED") {
      const result = await orderRepository.confirm(id);

      if (result.kind === "insufficient-stock") {
        throw new HttpError(
          409,
          "INSUFFICIENT_STOCK",
          "Current stock is insufficient to confirm this order",
        );
      }
      if (result.kind === "conflict") {
        throw new HttpError(409, "ORDER_STATUS_CHANGED", "Order status changed; refresh and retry");
      }

      return result.order;
    }

    if (currentOrder.status === "CONFIRMED" && input.status === "CANCELLED") {
      const result = await orderRepository.cancelConfirmed(id);

      if (result.kind !== "updated") {
        throw new HttpError(409, "ORDER_STATUS_CHANGED", "Order status changed; refresh and retry");
      }

      return result.order;
    }

    const updatedOrder = await orderRepository.updateStatus(id, currentOrder.status, input.status);

    if (!updatedOrder) {
      throw new HttpError(409, "ORDER_STATUS_CHANGED", "Order status changed; refresh and retry");
    }

    return updatedOrder;
  },
});
