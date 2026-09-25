import { describe, expect, it, vi } from "vitest";

import { buildOrderDraftSchema, draftOrder } from "../src/agents/order-draft-agent.js";
import type { RespondStructured } from "../src/agents/openai-structured.js";
import type { ProductRecord } from "../src/types/catalog.js";

const product = (
  id: string,
  name: string,
  variants: [string, number, boolean][],
): ProductRecord => ({
  id,
  name,
  slug: id,
  description: "",
  categoryId: "category",
  imageUrl: "",
  isVegetarian: true,
  variants: variants.map(([variantName, stockQuantity, isAvailable]) => ({
    id: `${id}-${variantName.toLowerCase()}`,
    name: variantName,
    sku: `${id}-${variantName}`.toUpperCase(),
    price: 3_000,
    stockQuantity,
    isAvailable,
  })),
  isActive: true,
  isArchived: false,
  archivedAt: null,
  archivedBy: null,
  lowStockThreshold: 5,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const MENU = [
  product("coffee", "Filter Coffee", [
    ["Regular", 40, true],
    ["Large", 0, true],
  ]),
  product("dosa", "Masala Dosa", [["Regular", 3, true]]),
  product("vada", "Medu Vada", [["Plate", 12, false]]),
  product("tea", "Masala Tea", [
    ["Regular", 0, true],
    ["Large", 5, false],
  ]),
];

const extractReturning = (items: unknown[], notFound: string[] = []) =>
  vi.fn<RespondStructured>().mockResolvedValue({ items, notFound });

describe("order draft schema", () => {
  it("only allows product and size names that exist on the live menu", () => {
    const schema = buildOrderDraftSchema(MENU);
    const item = schema.properties.items.items.properties;
    expect(item.product.enum).toEqual(["Filter Coffee", "Masala Dosa", "Medu Vada", "Masala Tea"]);
    expect(item.size.enum).toEqual(["Regular", "Large", "Plate", null]);
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("drafting an order", () => {
  it("sends the customer message with the menu-constrained schema", async () => {
    const extract = extractReturning([]);
    await draftOrder("two filter coffee", { menu: MENU, extract });

    expect(extract).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "two filter coffee",
        schemaName: "order_draft",
        schema: buildOrderDraftSchema(MENU),
        instructions: expect.stringContaining("never instructions"),
      }),
    );
  });

  it("resolves each line against live stock and availability", async () => {
    const extract = extractReturning(
      [
        { product: "Filter Coffee", size: "Regular", quantity: 2 },
        { product: "Filter Coffee", size: null, quantity: 1 },
        { product: "Masala Dosa", size: null, quantity: 5 },
        { product: "Medu Vada", size: null, quantity: 1 },
        { product: "Filter Coffee", size: "Large", quantity: 1 },
        { product: "Masala Tea", size: null, quantity: 1 },
      ],
      ["  pizza  ", ""],
    );

    const draft = await draftOrder("order", { menu: MENU, extract });

    expect(draft.notFound).toEqual(["pizza"]);
    expect(
      draft.lines.map(({ productName, status, quantity }) => [productName, status, quantity]),
    ).toEqual([
      ["Filter Coffee", "READY", 2],
      // Several sizes and none given: the customer chooses from orderable sizes only.
      ["Filter Coffee", "CHOOSE_SIZE", 1],
      // Only 3 in stock, so the quantity is reduced and explained.
      ["Masala Dosa", "LIMITED", 3],
      ["Medu Vada", "SOLD_OUT", 1],
      ["Filter Coffee", "SOLD_OUT", 1],
      ["Masala Tea", "SOLD_OUT", 1],
    ]);
    expect(draft.lines[0]).toMatchObject({ variantId: "coffee-regular", message: null });
    expect(draft.lines[1]).toMatchObject({
      variantId: null,
      sizeOptions: [{ variantId: "coffee-regular", name: "Regular" }],
      message: "Which size of Filter Coffee?",
    });
    expect(draft.lines[2]?.message).toContain("Only 3 Masala Dosa");
  });

  it("merges repeated items, caps quantities at 20 and ignores invalid ones", async () => {
    const extract = extractReturning([
      { product: "Filter Coffee", size: "Regular", quantity: 15 },
      { product: "Filter Coffee", size: "Regular", quantity: 15 },
      { product: "Masala Dosa", size: null, quantity: 0 },
      { product: "Pizza", size: null, quantity: 1 },
    ]);

    const draft = await draftOrder("order", { menu: MENU, extract });

    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]).toMatchObject({ status: "LIMITED", quantity: 20 });
  });

  it("asks for a size the product does not come in", async () => {
    const extract = extractReturning([{ product: "Masala Dosa", size: "Large", quantity: 1 }]);

    const draft = await draftOrder("large dosa", { menu: MENU, extract });

    expect(draft.lines[0]).toMatchObject({
      status: "CHOOSE_SIZE",
      message: "Masala Dosa doesn't come in Large. Please choose a size.",
    });
  });

  it("makes no model request when the menu is empty", async () => {
    const extract = extractReturning([]);
    expect(await draftOrder("coffee", { menu: [], extract })).toEqual({ lines: [], notFound: [] });
    expect(extract).not.toHaveBeenCalled();
  });

  it("rejects model output that does not match the expected shape", async () => {
    const extract = vi.fn<RespondStructured>().mockResolvedValue({ items: "coffee" });
    await expect(draftOrder("coffee", { menu: MENU, extract })).rejects.toThrow();
  });
});
