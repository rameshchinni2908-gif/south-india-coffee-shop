import { describe, expect, it } from "vitest";

import type {
  CategoryListFilters,
  CategoryRepository,
  CategoryWriteData,
} from "../src/repositories/category-repository.js";
import type { OrderRepository } from "../src/repositories/order-repository.js";
import type {
  ProductListFilters,
  ProductRepository,
  ProductWriteData,
} from "../src/repositories/product-repository.js";
import { createOrderService } from "../src/services/order-service.js";
import type {
  CategoryRecord,
  PaginatedResult,
  PriceHistoryInput,
  ProductRecord,
} from "../src/types/catalog.js";
import type {
  NewOrderRecord,
  OrderListFilters,
  OrderRecord,
  OrderStatus,
} from "../src/types/order.js";

const CATEGORY_ID = "507f1f77bcf86cd799439020";
const PRODUCT_ID = "507f1f77bcf86cd799439021";
const VARIANT_ID = "507f1f77bcf86cd799439022";
const NOW = new Date("2026-08-21T10:00:00.000Z");

const category: CategoryRecord = {
  id: CATEGORY_ID,
  name: "Coffee",
  slug: "coffee",
  displayOrder: 1,
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const createProduct = (overrides: Partial<ProductRecord> = {}): ProductRecord => ({
  id: PRODUCT_ID,
  name: "Filter Coffee",
  slug: "filter-coffee",
  description: "Traditional South Indian filter coffee",
  categoryId: CATEGORY_ID,
  imageUrl: "",
  isVegetarian: true,
  variants: [
    {
      id: VARIANT_ID,
      name: "Regular",
      sku: "COFFEE-REG",
      price: 4500,
      stockQuantity: 3,
      isAvailable: true,
    },
  ],
  isActive: true,
  isArchived: false,
  archivedAt: null,
  archivedBy: null,
  lowStockThreshold: 5,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

class FakeCategoryRepository implements CategoryRepository {
  public listPublic(): Promise<CategoryRecord[]> {
    return Promise.resolve([category]);
  }

  public listAdmin(_filters: CategoryListFilters): Promise<PaginatedResult<CategoryRecord>> {
    return Promise.resolve({
      items: [category],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  }

  public listActiveIds(): Promise<string[]> {
    return Promise.resolve([CATEGORY_ID]);
  }

  public findById(id: string): Promise<CategoryRecord | null> {
    return Promise.resolve(id === CATEGORY_ID ? category : null);
  }

  public findActiveBySlug(slug: string): Promise<CategoryRecord | null> {
    return Promise.resolve(slug === category.slug ? category : null);
  }

  public create(_data: CategoryWriteData): Promise<CategoryRecord> {
    return Promise.resolve(category);
  }

  public updateById(
    _id: string,
    _data: Partial<CategoryWriteData>,
  ): Promise<CategoryRecord | null> {
    return Promise.resolve(category);
  }
}

class FakeProductRepository implements ProductRepository {
  public product: ProductRecord | null = createProduct();

  public list(_filters: ProductListFilters): Promise<PaginatedResult<ProductRecord>> {
    return Promise.resolve({
      items: this.product ? [this.product] : [],
      meta: { page: 1, limit: 20, total: this.product ? 1 : 0, totalPages: 1 },
    });
  }

  public findById(id: string): Promise<ProductRecord | null> {
    return Promise.resolve(this.product?.id === id ? this.product : null);
  }

  public findPublicBySlug(slug: string): Promise<ProductRecord | null> {
    return Promise.resolve(this.product?.slug === slug ? this.product : null);
  }

  public findOrderableByIds(ids: string[]): Promise<ProductRecord[]> {
    return Promise.resolve(this.product && ids.includes(this.product.id) ? [this.product] : []);
  }

  public create(_data: ProductWriteData): Promise<ProductRecord> {
    return Promise.resolve(this.product ?? createProduct());
  }

  public updateById(
    _id: string,
    _data: Partial<ProductWriteData>,
    _priceHistory: PriceHistoryInput[],
  ): Promise<ProductRecord | null> {
    return Promise.resolve(this.product);
  }

  public archiveById(_id: string, _archivedBy: string): Promise<ProductRecord | null> {
    return Promise.resolve(this.product);
  }
}

const createOrderRecord = (status: OrderStatus = "PLACED"): OrderRecord => ({
  id: "507f1f77bcf86cd799439099",
  orderNumber: "SIC-20260821-ABC123",
  customerName: "Ramesh Kumar",
  customerMobile: "9876543210",
  items: [
    {
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      productName: "Filter Coffee",
      variantName: "Regular",
      sku: "COFFEE-REG",
      unitPrice: 4500,
      quantity: 2,
      lineTotal: 9000,
    },
  ],
  subtotal: 9000,
  taxAmount: 450,
  totalAmount: 9450,
  paymentMethod: "PAY_AT_SHOP",
  paymentStatus: status === "COMPLETED" ? "PAID" : "PENDING",
  status,
  pickupTime: new Date("2026-08-21T11:00:00.000Z"),
  notes: "Less sugar",
  createdAt: NOW,
  updatedAt: NOW,
});

class FakeOrderRepository implements OrderRepository {
  public createdOrder: NewOrderRecord | null = null;
  public currentOrder: OrderRecord | null = createOrderRecord();
  public confirmHasStock = true;
  public lastListFilters: OrderListFilters | null = null;

  public create(order: NewOrderRecord): Promise<OrderRecord> {
    this.createdOrder = order;

    return Promise.resolve({
      id: "507f1f77bcf86cd799439099",
      ...order,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  public list(filters: OrderListFilters) {
    this.lastListFilters = filters;
    return Promise.resolve({
      items: this.currentOrder ? [this.currentOrder] : [],
      meta: { page: filters.page, limit: filters.limit, total: 1, totalPages: 1 },
    });
  }

  public findById(id: string): Promise<OrderRecord | null> {
    return Promise.resolve(this.currentOrder?.id === id ? this.currentOrder : null);
  }

  public findByTracking(orderNumber: string, customerMobile: string): Promise<OrderRecord | null> {
    return Promise.resolve(
      this.currentOrder?.orderNumber === orderNumber &&
        this.currentOrder.customerMobile === customerMobile
        ? this.currentOrder
        : null,
    );
  }

  public updateStatus(
    id: string,
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
  ): Promise<OrderRecord | null> {
    if (this.currentOrder?.id !== id || this.currentOrder.status !== expectedStatus) {
      return Promise.resolve(null);
    }

    this.currentOrder = {
      ...this.currentOrder,
      status: nextStatus,
      paymentStatus: nextStatus === "COMPLETED" ? "PAID" : this.currentOrder.paymentStatus,
    };
    return Promise.resolve(this.currentOrder);
  }

  public confirm(id: string) {
    if (!this.confirmHasStock) {
      return Promise.resolve({ kind: "insufficient-stock" } as const);
    }
    if (this.currentOrder?.id !== id || this.currentOrder.status !== "PLACED") {
      return Promise.resolve({ kind: "conflict" } as const);
    }

    this.currentOrder = { ...this.currentOrder, status: "CONFIRMED" };
    return Promise.resolve({ kind: "updated", order: this.currentOrder } as const);
  }

  public cancelConfirmed(id: string) {
    if (this.currentOrder?.id !== id || this.currentOrder.status !== "CONFIRMED") {
      return Promise.resolve({ kind: "conflict" } as const);
    }

    this.currentOrder = { ...this.currentOrder, status: "CANCELLED" };
    return Promise.resolve({ kind: "updated", order: this.currentOrder } as const);
  }
}

const createService = (
  productRepository = new FakeProductRepository(),
  orderRepository = new FakeOrderRepository(),
  taxPercentage = 5,
) => ({
  service: createOrderService({
    orderRepository,
    productRepository,
    categoryRepository: new FakeCategoryRepository(),
    taxPercentage,
    now: () => NOW,
    generateOrderNumber: () => "SIC-20260821-ABC123",
  }),
  orderRepository,
});

const validInput = {
  customerName: "Ramesh Kumar",
  customerMobile: "9876543210",
  items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2 }],
  pickupTime: "2026-08-21T11:00:00.000Z",
  notes: "Less sugar",
};

describe("order service", () => {
  it("uses authoritative prices and stores item snapshots while calculating totals", async () => {
    const { service, orderRepository } = createService();

    const order = await service.create(validInput);

    expect(order).toMatchObject({
      orderNumber: "SIC-20260821-ABC123",
      subtotal: 9000,
      taxAmount: 450,
      totalAmount: 9450,
      paymentMethod: "PAY_AT_SHOP",
      paymentStatus: "PENDING",
      status: "PLACED",
    });
    expect(orderRepository.createdOrder?.items[0]).toEqual({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      productName: "Filter Coffee",
      variantName: "Regular",
      sku: "COFFEE-REG",
      unitPrice: 4500,
      quantity: 2,
      lineTotal: 9000,
    });
  });

  it("does not add tax when the confirmed tax percentage is zero", async () => {
    const { service } = createService(new FakeProductRepository(), new FakeOrderRepository(), 0);

    const order = await service.create(validInput);

    expect(order).toMatchObject({
      subtotal: 9000,
      taxAmount: 0,
      totalAmount: 9000,
    });
  });

  it("rejects quantities that exceed current stock", async () => {
    const { service, orderRepository } = createService();

    await expect(
      service.create({
        ...validInput,
        items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 4 }],
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "INSUFFICIENT_STOCK" });
    expect(orderRepository.createdOrder).toBeNull();
  });

  it("rejects unavailable variants", async () => {
    const productRepository = new FakeProductRepository();
    productRepository.product = createProduct({
      variants: [{ ...createProduct().variants[0]!, isAvailable: false }],
    });
    const { service } = createService(productRepository);

    await expect(service.create(validInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "VARIANT_UNAVAILABLE",
    });
  });

  it("rejects inactive or missing products", async () => {
    const productRepository = new FakeProductRepository();
    productRepository.product = null;
    const { service } = createService(productRepository);

    await expect(service.create(validInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "PRODUCT_UNAVAILABLE",
    });
  });

  it("rejects pickup times that are not in the future", async () => {
    const { service } = createService();

    await expect(
      service.create({ ...validInput, pickupTime: "2026-08-21T09:59:00.000Z" }),
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_PICKUP_TIME" });
  });

  it("confirms a placed order through the transactional repository operation", async () => {
    const { service, orderRepository } = createService();

    const order = await service.updateStatus(createOrderRecord().id, { status: "CONFIRMED" });

    expect(order.status).toBe("CONFIRMED");
    expect(orderRepository.currentOrder?.status).toBe("CONFIRMED");
  });

  it("rejects confirmation when current stock is insufficient", async () => {
    const { service, orderRepository } = createService();
    orderRepository.confirmHasStock = false;

    await expect(
      service.updateStatus(createOrderRecord().id, { status: "CONFIRMED" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "INSUFFICIENT_STOCK" });
  });

  it("rejects skipped and terminal status transitions", async () => {
    const { service, orderRepository } = createService();

    await expect(
      service.updateStatus(createOrderRecord().id, { status: "READY" }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_ORDER_STATUS_TRANSITION",
    });

    orderRepository.currentOrder = createOrderRecord("COMPLETED");
    await expect(
      service.updateStatus(createOrderRecord().id, { status: "CANCELLED" }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_ORDER_STATUS_TRANSITION",
    });
  });

  it("restores confirmed stock through the transactional cancellation operation", async () => {
    const { service, orderRepository } = createService();
    orderRepository.currentOrder = createOrderRecord("CONFIRMED");

    const order = await service.updateStatus(createOrderRecord().id, { status: "CANCELLED" });

    expect(order.status).toBe("CANCELLED");
  });

  it("moves a confirmed order through preparation, pickup, and completion", async () => {
    const { service, orderRepository } = createService();
    const orderId = createOrderRecord().id;
    orderRepository.currentOrder = createOrderRecord("CONFIRMED");

    await expect(service.updateStatus(orderId, { status: "PREPARING" })).resolves.toMatchObject({
      status: "PREPARING",
    });
    await expect(service.updateStatus(orderId, { status: "READY" })).resolves.toMatchObject({
      status: "READY",
    });
    await expect(service.updateStatus(orderId, { status: "COMPLETED" })).resolves.toMatchObject({
      status: "COMPLETED",
      paymentStatus: "PAID",
    });
  });

  it("tracks an order only when number and mobile both match", async () => {
    const { service } = createService();

    await expect(
      service.track({ orderNumber: "SIC-20260821-ABC123", customerMobile: "9876543210" }),
    ).resolves.toMatchObject({ status: "PLACED" });
    await expect(
      service.track({ orderNumber: "SIC-20260821-ABC123", customerMobile: "9999999999" }),
    ).rejects.toMatchObject({ statusCode: 404, code: "ORDER_NOT_FOUND" });
  });
});
