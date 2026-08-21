import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { HttpError } from "../src/middleware/http-error.js";
import type { AuthService } from "../src/services/auth-service.js";
import type { OrderService } from "../src/services/order-service.js";
import type { OrderRecord } from "../src/types/order.js";
import type { CreateOrderInput } from "../src/validation/order-schemas.js";

const PRODUCT_ID = "507f1f77bcf86cd799439021";
const VARIANT_ID = "507f1f77bcf86cd799439022";

const authService: AuthService = {
  login: () => Promise.reject(new HttpError(500, "UNEXPECTED_LOGIN", "Login was not expected")),
  authenticateAccessToken: (accessToken) =>
    accessToken === "staff"
      ? Promise.resolve({
          id: "507f1f77bcf86cd799439088",
          name: "Staff User",
          email: "staff@example.com",
          role: "STAFF",
        })
      : Promise.reject(new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required")),
};

const sampleOrder = (status: OrderRecord["status"] = "PLACED"): OrderRecord => {
  const createdAt = new Date("2026-08-21T10:00:00.000Z");

  return {
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
        quantity: 1,
        lineTotal: 4500,
      },
    ],
    subtotal: 4500,
    taxAmount: 0,
    totalAmount: 4500,
    paymentMethod: "PAY_AT_SHOP",
    paymentStatus: status === "COMPLETED" ? "PAID" : "PENDING",
    status,
    pickupTime: new Date("2026-08-21T11:00:00.000Z"),
    notes: "Less sugar",
    createdAt,
    updatedAt: createdAt,
  };
};

const createOrderApp = () => {
  let receivedInput: CreateOrderInput | null = null;
  const orderService: OrderService = {
    create: (input) => {
      receivedInput = input;
      return Promise.resolve({
        ...sampleOrder(),
        customerName: input.customerName,
        customerMobile: input.customerMobile,
        pickupTime: new Date(input.pickupTime),
        notes: input.notes,
      });
    },
    track: () => Promise.reject(new Error("Track was not expected")),
    list: () => Promise.reject(new Error("List was not expected")),
    updateStatus: () => Promise.reject(new Error("Status update was not expected")),
  };
  const app = createApp({
    clientUrl: "http://localhost:5173",
    authService,
    orderService,
    isProduction: false,
    databaseState: () => "connected",
    enableRequestLogging: false,
  });

  return { app, getReceivedInput: () => receivedInput };
};

const createManagementApp = () => {
  let updatedStatus: string | null = null;
  const orderService: OrderService = {
    create: () => Promise.reject(new Error("Create was not expected")),
    track: () => Promise.resolve(sampleOrder()),
    list: (query) =>
      Promise.resolve({
        items: [sampleOrder()],
        meta: { page: query.page, limit: query.limit, total: 1, totalPages: 1 },
      }),
    updateStatus: (_id, input) => {
      updatedStatus = input.status;
      return Promise.resolve(sampleOrder(input.status));
    },
  };
  const app = createApp({
    clientUrl: "http://localhost:5173",
    authService,
    orderService,
    isProduction: false,
    databaseState: () => "connected",
    enableRequestLogging: false,
  });

  return { app, getUpdatedStatus: () => updatedStatus };
};

const validOrder = {
  customerName: "Ramesh Kumar",
  customerMobile: "9876543210",
  items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
  pickupTime: "2026-08-21T11:00:00.000Z",
  notes: "Less sugar",
};

describe("order API", () => {
  it("creates a pickup order and returns the standard response shape", async () => {
    const testApp = createOrderApp();
    const response = await request(testApp.app).post("/api/orders").send(validOrder);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        order: {
          orderNumber: "SIC-20260821-ABC123",
          totalAmount: 4500,
          status: "PLACED",
        },
      },
      error: null,
    });
    expect(testApp.getReceivedInput()).toEqual(validOrder);
  });

  it("rejects client-supplied prices and product names", async () => {
    const testApp = createOrderApp();
    const response = await request(testApp.app)
      .post("/api/orders")
      .send({ ...validOrder, totalAmount: 1, items: [{ ...validOrder.items[0], unitPrice: 1 }] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(testApp.getReceivedInput()).toBeNull();
  });

  it("rejects invalid Indian mobile numbers", async () => {
    const { app } = createOrderApp();
    const response = await request(app)
      .post("/api/orders")
      .send({ ...validOrder, customerMobile: "12345" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("tracks an order using order number and mobile", async () => {
    const { app } = createManagementApp();
    const response = await request(app).post("/api/orders/track").send({
      orderNumber: "sic-20260821-abc123",
      customerMobile: "9876543210",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.order).toMatchObject({
      orderNumber: "SIC-20260821-ABC123",
      status: "PLACED",
    });
  });

  it("protects the admin order list", async () => {
    const { app } = createManagementApp();
    const response = await request(app).get("/api/admin/orders");

    expect(response.status).toBe(401);
  });

  it("allows authenticated staff to list and update order status", async () => {
    const testApp = createManagementApp();
    const listResponse = await request(testApp.app)
      .get("/api/admin/orders?status=PLACED")
      .set("Cookie", "staff_access_token=staff");
    const updateResponse = await request(testApp.app)
      .patch(`/api/admin/orders/${sampleOrder().id}/status`)
      .set("Cookie", "staff_access_token=staff")
      .send({ status: "CONFIRMED" });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.orders).toHaveLength(1);
    expect(updateResponse.status).toBe(200);
    expect(testApp.getUpdatedStatus()).toBe("CONFIRMED");
  });
});
