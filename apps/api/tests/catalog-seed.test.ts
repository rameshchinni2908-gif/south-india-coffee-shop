import { describe, expect, it } from "vitest";
import { Types } from "mongoose";

import { ProductModel } from "../src/models/product-model.js";
import {
  DEFAULT_CATEGORIES,
  SAMPLE_PRODUCTS,
  seedCatalog,
  type CatalogSeedCategory,
  type CatalogSeedProduct,
  type CatalogSeedStore,
} from "../src/seeds/catalog-seed.js";

class InMemoryCatalogSeedStore implements CatalogSeedStore {
  public readonly categories = new Map<string, { id: string; category: CatalogSeedCategory }>();
  public readonly products = new Map<string, { categoryId: string; product: CatalogSeedProduct }>();

  public async findOrCreateCategory(
    category: CatalogSeedCategory,
  ): Promise<{ id: string; created: boolean }> {
    const existing = this.categories.get(category.slug);

    if (existing) {
      return { id: existing.id, created: false };
    }

    const id = `category-${this.categories.size + 1}`;
    this.categories.set(category.slug, {
      id,
      category: structuredClone(category),
    });

    return { id, created: true };
  }

  public async createProductIfMissing(
    product: CatalogSeedProduct,
    categoryId: string,
  ): Promise<boolean> {
    const seedSkus = new Set(product.variants.map((variant) => variant.sku));
    const existing = [...this.products.values()].find(
      (entry) =>
        entry.product.slug === product.slug ||
        entry.product.variants.some((variant) => seedSkus.has(variant.sku)),
    );

    if (existing) {
      return false;
    }

    this.products.set(product.slug, {
      categoryId,
      product: structuredClone(product),
    });

    return true;
  }
}

describe("seedCatalog", () => {
  it("defines schema-valid products with unique sample SKUs and integer paise prices", async () => {
    const skus = SAMPLE_PRODUCTS.flatMap((product) =>
      product.variants.map((variant) => variant.sku),
    );

    expect(DEFAULT_CATEGORIES.every((category) => category.isActive)).toBe(true);
    expect(new Set(skus).size).toBe(skus.length);
    expect(SAMPLE_PRODUCTS.every((product) => !product.isActive)).toBe(true);

    for (const product of SAMPLE_PRODUCTS) {
      expect(product.variants.every((variant) => Number.isInteger(variant.price))).toBe(true);
      await expect(
        new ProductModel({
          ...product,
          categoryId: new Types.ObjectId(),
        }).validate(),
      ).resolves.toBeUndefined();
    }
  });

  it("creates every default category and sample product", async () => {
    const store = new InMemoryCatalogSeedStore();

    const result = await seedCatalog(store);

    expect(result).toEqual({
      createdCategories: DEFAULT_CATEGORIES.length,
      existingCategories: 0,
      createdProducts: SAMPLE_PRODUCTS.length,
      existingProducts: 0,
    });
    expect([...store.categories.keys()]).toEqual(DEFAULT_CATEGORIES.map(({ slug }) => slug));
    expect([...store.products.keys()]).toEqual(SAMPLE_PRODUCTS.map(({ slug }) => slug));
    expect(
      [...store.products.values()].every((entry) =>
        [...store.categories.values()].some((category) => category.id === entry.categoryId),
      ),
    ).toBe(true);
  });

  it("is safe to rerun and preserves staff changes", async () => {
    const store = new InMemoryCatalogSeedStore();
    await seedCatalog(store);
    const coffee = store.products.get("south-indian-filter-coffee");

    if (!coffee) {
      throw new Error("Expected seeded coffee product");
    }

    coffee.product.variants[0]!.price = 9900;
    coffee.product.variants[0]!.stockQuantity = 3;

    const result = await seedCatalog(store);

    expect(result).toEqual({
      createdCategories: 0,
      existingCategories: DEFAULT_CATEGORIES.length,
      createdProducts: 0,
      existingProducts: SAMPLE_PRODUCTS.length,
    });
    expect(store.products.get("south-indian-filter-coffee")?.product.variants[0]).toMatchObject({
      price: 9900,
      stockQuantity: 3,
    });
  });
});
