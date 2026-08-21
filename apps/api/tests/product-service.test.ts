import { describe, expect, it } from "vitest";

import type {
  CategoryListFilters,
  CategoryRepository,
  CategoryWriteData,
} from "../src/repositories/category-repository.js";
import type {
  ProductListFilters,
  ProductRepository,
  ProductWriteData,
} from "../src/repositories/product-repository.js";
import { createProductService } from "../src/services/product-service.js";
import type {
  CategoryRecord,
  PaginatedResult,
  PriceHistoryInput,
  ProductRecord,
} from "../src/types/catalog.js";

const CATEGORY_ID = "507f1f77bcf86cd799439020";
const PRODUCT_ID = "507f1f77bcf86cd799439021";
const VARIANT_ID = "507f1f77bcf86cd799439022";
const ADMIN_ID = "507f1f77bcf86cd799439023";

const category: CategoryRecord = {
  id: CATEGORY_ID,
  name: "Coffee",
  slug: "coffee",
  displayOrder: 1,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
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
  public lastListFilters: ProductListFilters | null = null;
  public lastPriceHistory: PriceHistoryInput[] = [];
  public archiveCalls = 0;

  public list(filters: ProductListFilters): Promise<PaginatedResult<ProductRecord>> {
    this.lastListFilters = filters;
    return Promise.resolve({
      items: this.product ? [this.product] : [],
      meta: {
        page: filters.page,
        limit: filters.limit,
        total: this.product ? 1 : 0,
        totalPages: 1,
      },
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
    id: string,
    data: Partial<ProductWriteData>,
    priceHistory: PriceHistoryInput[],
  ): Promise<ProductRecord | null> {
    if (!this.product || this.product.id !== id) {
      return Promise.resolve(null);
    }

    this.lastPriceHistory = priceHistory;
    this.product = { ...this.product, ...data, updatedAt: new Date() };
    return Promise.resolve(this.product);
  }

  public archiveById(id: string, archivedBy: string): Promise<ProductRecord | null> {
    this.archiveCalls += 1;

    if (!this.product || this.product.id !== id) {
      return Promise.resolve(null);
    }

    this.product = {
      ...this.product,
      isActive: false,
      isArchived: true,
      archivedAt: new Date(),
      archivedBy,
    };
    return Promise.resolve(this.product);
  }
}

describe("product service", () => {
  it("applies public active-category, availability, vegetarian, and pagination filters", async () => {
    const productRepository = new FakeProductRepository();
    const service = createProductService(productRepository, new FakeCategoryRepository());

    await service.listPublic({
      page: 2,
      limit: 10,
      category: "coffee",
      available: true,
      vegetarian: true,
      sortBy: "name",
      sortOrder: "asc",
    });

    expect(productRepository.lastListFilters).toEqual({
      page: 2,
      limit: 10,
      categoryIds: [CATEGORY_ID],
      availability: true,
      isVegetarian: true,
      isActive: true,
      isArchived: false,
      sortBy: "name",
      sortOrder: "asc",
    });
  });

  it("records a price-history entry when an existing variant price changes", async () => {
    const productRepository = new FakeProductRepository();
    const service = createProductService(productRepository, new FakeCategoryRepository());

    await service.update(
      PRODUCT_ID,
      {
        variants: [
          {
            id: VARIANT_ID,
            name: "Regular",
            sku: "COFFEE-REG",
            price: 5000,
            stockQuantity: 20,
            isAvailable: true,
          },
        ],
      },
      ADMIN_ID,
    );

    expect(productRepository.lastPriceHistory).toHaveLength(1);
    expect(productRepository.lastPriceHistory[0]).toMatchObject({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      variantSku: "COFFEE-REG",
      oldPrice: 4500,
      newPrice: 5000,
      changedBy: ADMIN_ID,
    });
  });

  it("does not create price history for a stock-only update", async () => {
    const productRepository = new FakeProductRepository();
    const service = createProductService(productRepository, new FakeCategoryRepository());

    await service.updateAvailability(PRODUCT_ID, {
      variants: [{ id: VARIANT_ID, stockQuantity: 10 }],
    });

    expect(productRepository.lastPriceHistory).toEqual([]);
    expect(productRepository.product?.variants[0]?.stockQuantity).toBe(10);
  });

  it("rejects variants that do not belong to the product", async () => {
    const service = createProductService(new FakeProductRepository(), new FakeCategoryRepository());

    await expect(
      service.updateAvailability(PRODUCT_ID, {
        variants: [{ id: "507f1f77bcf86cd799439099", isAvailable: false }],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "VARIANT_NOT_FOUND" });
  });

  it("enforces ADMIN-only product archival in the service layer", async () => {
    const productRepository = new FakeProductRepository();
    const service = createProductService(productRepository, new FakeCategoryRepository());

    await expect(
      service.archive(PRODUCT_ID, { id: ADMIN_ID, role: "STAFF" }),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(productRepository.archiveCalls).toBe(0);
  });

  it("soft-archives a product for an ADMIN", async () => {
    const productRepository = new FakeProductRepository();
    const service = createProductService(productRepository, new FakeCategoryRepository());

    const product = await service.archive(PRODUCT_ID, { id: ADMIN_ID, role: "ADMIN" });

    expect(product).toMatchObject({
      isActive: false,
      isArchived: true,
      archivedBy: ADMIN_ID,
    });
  });
});
