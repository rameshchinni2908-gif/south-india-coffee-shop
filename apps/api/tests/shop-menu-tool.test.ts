import { describe, expect, it, vi } from "vitest";

import { createShopMenuTool } from "../src/agents/shop-menu-tool.js";
import type { ProductService } from "../src/services/product-service.js";

const generatedAt = new Date("2026-09-13T08:00:00.000Z");
const product = () => ({
  id: "private-product-id",
  name: "Filter Coffee",
  slug: "private-product-slug",
  description: "Freshly brewed South Indian filter coffee.",
  categoryId: "private-category-id",
  imageUrl: "https://shop.example/private-image",
  isVegetarian: true,
  variants: [
    {
      id: "private-variant-id",
      name: "Regular",
      sku: "private-sku",
      price: 4550,
      stockQuantity: 5,
      isAvailable: true,
      supplierContact: "private-phone",
    },
  ],
  isActive: true,
  isArchived: false,
  archivedAt: null,
  archivedBy: "private-staff-id",
  lowStockThreshold: 5,
  createdAt: generatedAt,
  updatedAt: generatedAt,
  staffNotes: "private-staff-notes",
});
const menu = () => ({
  items: [product()],
  meta: { page: 1, limit: 30, total: 1, totalPages: 1, privateMetadata: "private-meta" },
  customerMobile: "private-customer-mobile",
});
const toolFor = (input: unknown) => {
  const listPublic = vi
    .fn<ProductService["listPublic"]>()
    .mockResolvedValue(input as Awaited<ReturnType<ProductService["listPublic"]>>);
  return { listPublic, tool: createShopMenuTool({ listPublic }, () => generatedAt) };
};

describe("shop menu tool", () => {
  it("reads the bounded public menu including unavailable sizes and projects only permitted data", async () => {
    const { tool, listPublic } = toolFor(menu());
    const snapshot = await tool();

    expect(listPublic).toHaveBeenCalledExactlyOnceWith({
      page: 1,
      limit: 30,
      available: "all",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(snapshot).toEqual({
      generatedAt: generatedAt.toISOString(),
      totalProducts: 1,
      listIsPartial: false,
      products: [
        {
          name: "Filter Coffee",
          description: "Freshly brewed South Indian filter coffee.",
          isVegetarian: true,
          variants: [
            {
              name: "Regular",
              pricePaise: 4550,
              priceFormatted: "₹45.50",
              stockQuantity: 5,
              isAvailable: true,
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /private-|archived|staff|categoryId|supplier|customer|imageUrl|sku|createdAt|updatedAt/,
    );
  });

  it("keeps unavailable products and preserves stock separately from the availability flag", async () => {
    const input = menu();
    input.items[0]!.isVegetarian = false;
    input.items[0]!.variants = [
      { ...product().variants[0]!, price: 0, stockQuantity: 0, isAvailable: false },
      { ...product().variants[0]!, name: "Large", stockQuantity: 8, isAvailable: false },
    ];

    const snapshot = await toolFor(input).tool();

    expect(snapshot.products[0]).toMatchObject({
      isVegetarian: false,
      variants: [
        {
          name: "Regular",
          pricePaise: 0,
          priceFormatted: "₹0.00",
          stockQuantity: 0,
          isAvailable: false,
        },
        { name: "Large", stockQuantity: 8, isAvailable: false },
      ],
    });
  });

  it("marks the first thirty products as partial instead of claiming the whole menu is present", async () => {
    const input = menu();
    input.items = Array.from({ length: 30 }, (_, index) => ({
      ...product(),
      name: `Coffee ${index + 1}`,
    }));
    input.meta.total = 45;
    input.meta.totalPages = 2;

    const snapshot = await toolFor(input).tool();

    expect(snapshot.totalProducts).toBe(45);
    expect(snapshot.listIsPartial).toBe(true);
    expect(snapshot.products).toHaveLength(30);
  });

  it("bounds valid long descriptions without rejecting the product", async () => {
    const input = menu();
    input.items[0]!.description = "a".repeat(1_000);

    const snapshot = await toolFor(input).tool();

    expect(snapshot.products[0]?.description).toBe("a".repeat(600));
  });

  it("represents an empty public menu", async () => {
    const snapshot = await toolFor({ items: [], meta: { total: 0 } }).tool();
    expect(snapshot).toEqual({
      generatedAt: generatedAt.toISOString(),
      totalProducts: 0,
      listIsPartial: false,
      products: [],
    });
  });

  it("fetches current stock and records a fresh timestamp on every call", async () => {
    const first = menu();
    const second = menu();
    second.items[0]!.variants[0]!.stockQuantity = 1;
    const listPublic = vi
      .fn<ProductService["listPublic"]>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const nextTime = new Date("2026-09-13T08:01:00.000Z");
    const now = vi.fn<() => Date>().mockReturnValueOnce(generatedAt).mockReturnValueOnce(nextTime);
    const tool = createShopMenuTool({ listPublic }, now);

    expect((await tool()).products[0]?.variants[0]?.stockQuantity).toBe(5);
    const refreshed = await tool();
    expect(refreshed.products[0]?.variants[0]?.stockQuantity).toBe(1);
    expect(refreshed.generatedAt).toBe(nextTime.toISOString());
    expect(listPublic).toHaveBeenCalledTimes(2);
  });

  it.each([
    null,
    { items: [product()], meta: { total: "private-invalid-total" } },
    { items: [product()], meta: { total: 0 } },
    { items: [{ ...product(), description: "a".repeat(1_001) }], meta: { total: 1 } },
    { items: [{ ...product(), variants: [] }], meta: { total: 1 } },
    {
      items: [{ ...product(), variants: Array.from({ length: 21 }, () => product().variants[0]) }],
      meta: { total: 1 },
    },
    { items: Array.from({ length: 31 }, product), meta: { total: 31 } },
    ...[-1, 1.5, "4550", Infinity].map((price) => ({
      items: [{ ...product(), variants: [{ ...product().variants[0], price }] }],
      meta: { total: 1 },
    })),
    {
      items: [{ ...product(), variants: [{ ...product().variants[0], stockQuantity: -1 }] }],
      meta: { total: 1 },
    },
    {
      items: [{ ...product(), variants: [{ ...product().variants[0], isAvailable: "true" }] }],
      meta: { total: 1 },
    },
  ])("rejects malformed menu data without echoing its contents", async (input) => {
    await expect(toolFor(input).tool()).rejects.toEqual(
      new Error("The shop returned an unexpected menu format."),
    );
  });

  it("does not return database error details or retry a failed menu read", async () => {
    const listPublic = vi
      .fn<ProductService["listPublic"]>()
      .mockRejectedValue(new Error("private database connection and password"));

    await expect(createShopMenuTool({ listPublic })()).rejects.toEqual(
      new Error("The shop menu could not be read."),
    );
    expect(listPublic).toHaveBeenCalledTimes(1);
  });
});
