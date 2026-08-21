import { describe, expect, it } from "vitest";

import type {
  CategoryListFilters,
  CategoryRepository,
  CategoryWriteData,
} from "../src/repositories/category-repository.js";
import { createCategoryService } from "../src/services/category-service.js";
import type { CategoryRecord, PaginatedResult } from "../src/types/catalog.js";

const CATEGORY_ID = "507f1f77bcf86cd799439020";

const category: CategoryRecord = {
  id: CATEGORY_ID,
  name: "Hot Beverages",
  slug: "hot-beverages",
  displayOrder: 1,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

class FakeCategoryRepository implements CategoryRepository {
  public createdData: CategoryWriteData | null = null;
  public lastListFilters: CategoryListFilters | null = null;
  public findResult: CategoryRecord | null = category;

  public listPublic(): Promise<CategoryRecord[]> {
    return Promise.resolve([category]);
  }

  public listAdmin(filters: CategoryListFilters): Promise<PaginatedResult<CategoryRecord>> {
    this.lastListFilters = filters;
    return Promise.resolve({
      items: [category],
      meta: { page: filters.page, limit: filters.limit, total: 1, totalPages: 1 },
    });
  }

  public listActiveIds(): Promise<string[]> {
    return Promise.resolve([CATEGORY_ID]);
  }

  public findById(): Promise<CategoryRecord | null> {
    return Promise.resolve(this.findResult);
  }

  public findActiveBySlug(): Promise<CategoryRecord | null> {
    return Promise.resolve(category);
  }

  public create(data: CategoryWriteData): Promise<CategoryRecord> {
    this.createdData = data;
    return Promise.resolve({ ...category, ...data });
  }

  public updateById(_id: string, data: Partial<CategoryWriteData>): Promise<CategoryRecord | null> {
    return Promise.resolve(this.findResult ? { ...this.findResult, ...data } : null);
  }
}

describe("category service", () => {
  it("generates a stable slug when creating a category", async () => {
    const repository = new FakeCategoryRepository();
    const service = createCategoryService(repository);

    await service.create({
      name: "Fresh Breakfast Items",
      displayOrder: 2,
      isActive: true,
    });

    expect(repository.createdData).toMatchObject({ slug: "fresh-breakfast-items" });
  });

  it("maps validated admin search and pagination filters", async () => {
    const repository = new FakeCategoryRepository();
    const service = createCategoryService(repository);

    await service.listAdmin({
      page: 2,
      limit: 10,
      search: "coffee",
      active: true,
      sortOrder: "asc",
    });

    expect(repository.lastListFilters).toEqual({
      page: 2,
      limit: 10,
      search: "coffee",
      isActive: true,
      sortOrder: "asc",
    });
  });

  it("returns a safe not-found error when updating a missing category", async () => {
    const repository = new FakeCategoryRepository();
    repository.findResult = null;
    const service = createCategoryService(repository);

    await expect(service.update(CATEGORY_ID, { isActive: false })).rejects.toMatchObject({
      statusCode: 404,
      code: "CATEGORY_NOT_FOUND",
    });
  });
});
