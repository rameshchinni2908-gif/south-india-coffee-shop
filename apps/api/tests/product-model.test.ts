import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { ProductModel } from "../src/models/product-model.js";

describe("ProductModel", () => {
  it("accepts the empty image URL allowed by the API and admin form", async () => {
    const product = new ProductModel({
      name: "Filter Coffee",
      slug: "filter-coffee",
      description: "Traditional South Indian filter coffee",
      categoryId: new Types.ObjectId(),
      imageUrl: "",
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

    await expect(product.validate()).resolves.toBeUndefined();
  });
});
