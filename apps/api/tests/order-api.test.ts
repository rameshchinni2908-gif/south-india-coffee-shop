import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { HttpError } from "../src/middleware/http-error.js";
import type { AuthService } from "../src/services/auth-service.js";
import type { OrderService } from "../src/services/order-service.js";
import type { CreateOrderInput } from "../src/validation/order-schemas.js";

const PRODUCT_ID = "507f1f77bcf86cd799439021";
const VARIANT_ID = "507f1f77bcf86cd799439022";

const authService: AuthService = {
  login: () => Promise.reject(new HttpError(500, "UNEXPECTED_LOGIN", "Login was not expected")),
  authenticateAccessToken: () =>
    Promise.reject(new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required")),
};

const createOrderApp = () => {
  let receivedInput: CreateOrderInput | null = null;
  const orderService: OrderService = {
    create: (input) => {
      receivedInput = input;
      const createdAt = new Date("2026-08-21T10:00:00.000Z");

      return Promise.resolve({
        id: "507f1f77bcf86cd799439099",
        orderNumber: "SIC-20260821-ABC123",
        customerName: input.customerName,
        customerMobile: input.customerMobile,
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
        paymentStatus: "PENDING",
        status: "PLACED",
        pickupTime: new Date(input.pickupTime),
        notes: input.notes,
        createdAt,
        updatedAt: createdAt,
      });
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

  return { app, getReceivedInput: () => receivedInput };
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
});
