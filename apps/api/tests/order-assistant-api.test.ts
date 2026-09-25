import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { RespondStructured } from "../src/agents/openai-structured.js";
import { createApp } from "../src/app.js";
import { createOrderAssistantService } from "../src/services/order-assistant-service.js";
import type { ProductService } from "../src/services/product-service.js";
import { unusedAuthService } from "./helpers/test-auth-service.js";

const coffee = {
  id: "coffee",
  name: "Filter Coffee",
  slug: "filter-coffee",
  description: "",
  categoryId: "category",
  imageUrl: "",
  isVegetarian: true,
  variants: [
    {
      id: "coffee-regular",
      name: "Regular",
      sku: "FC-R",
      price: 3_000,
      stockQuantity: 10,
      isAvailable: true,
    },
  ],
  isActive: true,
  isArchived: false,
  archivedAt: null,
  archivedBy: null,
  lowStockThreshold: 5,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const setup = ({
  extract,
  dailyLimit = 100,
  now = () => new Date("2026-09-25T06:00:00.000Z"),
}: {
  extract?: RespondStructured;
  dailyLimit?: number;
  now?: () => Date;
} = {}) => {
  const productService = {
    listPublic: vi.fn<ProductService["listPublic"]>().mockResolvedValue({
      items: [coffee],
      meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
    }),
  };
  const app = createApp({
    clientUrl: "https://shop.example.com",
    authService: unusedAuthService,
    orderAssistantService: createOrderAssistantService({
      productService,
      ...(extract ? { extract } : {}),
      dailyLimit,
      timezone: "Asia/Kolkata",
      now,
    }),
    isProduction: true,
    databaseState: () => "connected",
    enableRequestLogging: false,
  });
  return { app, productService };
};
const draft = (app: ReturnType<typeof setup>["app"], body: unknown) =>
  request(app)
    .post("/api/order-assistant/draft")
    .send(body as object);
const twoCoffees = () =>
  vi.fn<RespondStructured>().mockResolvedValue({
    items: [{ product: "Filter Coffee", size: null, quantity: 2 }],
    notFound: [],
  });

describe("public order assistant API", () => {
  it("returns a reviewable draft without authentication", async () => {
    const extract = twoCoffees();
    const response = await draft(setup({ extract }).app, { message: "  two coffees please " });

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.data.draft).toEqual({
      lines: [
        expect.objectContaining({
          productId: "coffee",
          variantId: "coffee-regular",
          quantity: 2,
          status: "READY",
        }),
      ],
      notFound: [],
    });
    expect(extract).toHaveBeenCalledWith(expect.objectContaining({ input: "two coffees please" }));
  });

  it.each([{}, { message: " " }, { message: "x".repeat(301) }, { message: "tea", price: 0 }])(
    "validates the message before spending a model call (%j)",
    async (body) => {
      const extract = twoCoffees();
      expect((await draft(setup({ extract }).app, body)).status).toBe(400);
      expect(extract).not.toHaveBeenCalled();
    },
  );

  it("rejects requests from other websites", async () => {
    const extract = twoCoffees();
    const response = await draft(setup({ extract }).app, { message: "coffee" }).set(
      "Origin",
      "https://elsewhere.example.com",
    );
    expect(response.status).toBe(403);
    expect(extract).not.toHaveBeenCalled();
  });

  it("is unavailable when disabled", async () => {
    const response = await draft(setup().app, { message: "coffee" });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("ORDER_ASSISTANT_DISABLED");
  });

  it("stops at the daily cap and resets on the next shop day", async () => {
    let now = new Date("2026-09-25T06:00:00.000Z");
    const extract = twoCoffees();
    const { app } = setup({ extract, dailyLimit: 2, now: () => now });

    expect((await draft(app, { message: "coffee" })).status).toBe(200);
    expect((await draft(app, { message: "coffee" })).status).toBe(200);
    const capped = await draft(app, { message: "coffee" });
    expect(capped.status).toBe(429);
    expect(capped.body.error.code).toBe("ORDER_ASSISTANT_BUSY");
    expect(extract).toHaveBeenCalledTimes(2);

    // 18:30 UTC is midnight in Asia/Kolkata.
    now = new Date("2026-09-25T18:31:00.000Z");
    expect((await draft(app, { message: "coffee" })).status).toBe(200);
  });

  it("hides provider failures from customers", async () => {
    const extract = vi
      .fn<RespondStructured>()
      .mockRejectedValue(new Error("secret-key private provider body"));
    const response = await draft(setup({ extract }).app, { message: "coffee" });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("ORDER_ASSISTANT_UNAVAILABLE");
    expect(response.text).not.toMatch(/secret-key|provider body/);
  });
});
