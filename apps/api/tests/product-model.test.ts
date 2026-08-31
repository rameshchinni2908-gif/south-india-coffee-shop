import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { ProductModel } from "../src/models/product-model.js";

const createProduct = (imageUrl?: string) =>
  new ProductModel({
    name: "Filter Coffee",
    slug: "filter-coffee",
    description: "Traditional South Indian filter coffee",
    categoryId: new Types.ObjectId(),
    ...(imageUrl === undefined ? {} : { imageUrl }),
    isVegetarian: true,
    variants: [
      {
        name: "Regular",
        sku: "FILTER_COFFEE_REG",
        price: 4000,
        stockQuantity: 50,
        isAvailable: true,
      },
    ],
    isActive: true,
    lowStockThreshold: 5,
  });

describe("ProductModel", () => {
  it("accepts the empty image URL allowed by the API and admin form", async () => {
    const product = createProduct("");

    await expect(product.validate()).resolves.toBeUndefined();
  });

  it("defaults an omitted image URL to an empty string", async () => {
    const product = createProduct();

    await expect(product.validate()).resolves.toBeUndefined();
    expect(product.imageUrl).toBe("");
  });
});
