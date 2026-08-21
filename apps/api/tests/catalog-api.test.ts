import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { HttpError } from "../src/middleware/http-error.js";
import type { AuthService } from "../src/services/auth-service.js";
import type { CategoryService } from "../src/services/category-service.js";
import type { ProductService } from "../src/services/product-service.js";
import type { CategoryRecord, ProductRecord } from "../src/types/catalog.js";
import type { PublicProductQuery } from "../src/validation/catalog-schemas.js";

const CATEGORY_ID = "507f1f77bcf86cd799439020";
const PRODUCT_ID = "507f1f77bcf86cd799439021";
const VARIANT_ID = "507f1f77bcf86cd799439022";

const category: CategoryRecord = {
  id: CATEGORY_ID,
  name: "Coffee",
  slug: "coffee",
  displayOrder: 1,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const product: ProductRecord = {
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
      stockQuantity: 20,
      isAvailable: true,
    },
  ],
  isActive: true,
  isArchived: false,
  archivedAt: null,
  archivedBy: null,
  lowStockThreshold: 5,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const authService: AuthService = {
  async login() {
    throw new HttpError(500, "UNEXPECTED_LOGIN", "Login was not expected");
  },
  async authenticateAccessToken(accessToken) {
    if (accessToken !== "admin" && accessToken !== "staff") {
      throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    }

    return {
      id: "507f1f77bcf86cd799439023",
      name: "Test User",
      email: "staff@example.com",
      role: accessToken === "admin" ? "ADMIN" : "STAFF",
    };
  },
};

const createCatalogApp = () => {
  let publicQuery: PublicProductQuery | null = null;
  let archiveCalls = 0;
  const categoryService: CategoryService = {
    listPublic: () => Promise.resolve([category]),
    listAdmin: () =>
      Promise.resolve({
        items: [category],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      }),
    create: () => Promise.resolve(category),
    update: () => Promise.resolve(category),
  };
  const productService: ProductService = {
    listPublic: (query) => {
      publicQuery = query;
      return Promise.resolve({
        items: [product],
        meta: { page: query.page, limit: query.limit, total: 1, totalPages: 1 },
      });
    },
    getPublicBySlug: () => Promise.resolve(product),
    listAdmin: () =>
      Promise.resolve({
        items: [product],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      }),
    getAdminById: () => Promise.resolve(product),
    create: () => Promise.resolve(product),
    update: () => Promise.resolve(product),
    updateAvailability: () => Promise.resolve(product),
    archive: () => {
      archiveCalls += 1;
      return Promise.resolve({ ...product, isActive: false, isArchived: true });
    },
  };
  const app = createApp({
    clientUrl: "http://localhost:5173",
    authService,
    isProduction: false,
    databaseState: () => "connected",
    enableRequestLogging: false,
    catalogServices: { categoryService, productService },
  });

  return {
    app,
    getPublicQuery: () => publicQuery,
    getArchiveCalls: () => archiveCalls,
  };
};

describe("catalog API", () => {
  it("lists public categories", async () => {
    const { app } = createCatalogApp();
    const response = await request(app).get("/api/categories");

    expect(response.status).toBe(200);
    expect(response.body.data.categories[0].slug).toBe("coffee");
  });

  it("normalizes public product filters and returns pagination metadata", async () => {
    const testApp = createCatalogApp();
    const response = await request(testApp.app).get(
      "/api/products?page=2&limit=5&category=coffee&available=true&vegetarian=true",
    );

    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({ page: 2, limit: 5, total: 1 });
    expect(testApp.getPublicQuery()).toMatchObject({
      page: 2,
      limit: 5,
      category: "coffee",
      available: true,
      vegetarian: true,
    });
  });

  it("rejects unrecognized query operators", async () => {
    const { app } = createCatalogApp();
    const response = await request(app).get("/api/products?$where=true");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires staff authentication on admin catalog routes", async () => {
    const { app } = createCatalogApp();
    const response = await request(app).get("/api/admin/products");

    expect(response.status).toBe(401);
  });

  it("allows STAFF to update stock and availability", async () => {
    const { app } = createCatalogApp();
    const response = await request(app)
      .patch(`/api/admin/products/${PRODUCT_ID}/availability`)
      .set("Cookie", "staff_access_token=staff")
      .send({ variants: [{ id: VARIANT_ID, stockQuantity: 9, isAvailable: true }] });

    expect(response.status).toBe(200);
  });

  it("rejects negative prices before the service is called", async () => {
    const { app } = createCatalogApp();
    const response = await request(app)
      .post("/api/admin/products")
      .set("Cookie", "staff_access_token=staff")
      .send({
        name: "Filter Coffee",
        description: "Traditional coffee",
        categoryId: CATEGORY_ID,
        variants: [
          {
            name: "Regular",
            sku: "COFFEE-REG",
            price: -1,
            stockQuantity: 10,
            isAvailable: true,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("prevents STAFF from archiving products", async () => {
    const testApp = createCatalogApp();
    const response = await request(testApp.app)
      .delete(`/api/admin/products/${PRODUCT_ID}`)
      .set("Cookie", "staff_access_token=staff");

    expect(response.status).toBe(403);
    expect(testApp.getArchiveCalls()).toBe(0);
  });

  it("allows an ADMIN to soft-archive products", async () => {
    const testApp = createCatalogApp();
    const response = await request(testApp.app)
      .delete(`/api/admin/products/${PRODUCT_ID}`)
      .set("Cookie", "staff_access_token=admin");

    expect(response.status).toBe(200);
    expect(response.body.data.product).toMatchObject({ isActive: false, isArchived: true });
    expect(testApp.getArchiveCalls()).toBe(1);
  });
});
