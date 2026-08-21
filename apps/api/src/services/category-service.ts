import { HttpError } from "../middleware/http-error.js";
import type {
  CategoryListFilters,
  CategoryRepository,
  CategoryWriteData,
} from "../repositories/category-repository.js";
import type { CategoryRecord, PaginatedResult } from "../types/catalog.js";
import { createSlug } from "../utils/slug.js";
import type {
  AdminCategoryQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../validation/catalog-schemas.js";

export interface CategoryService {
  listPublic(): Promise<CategoryRecord[]>;
  listAdmin(query: AdminCategoryQuery): Promise<PaginatedResult<CategoryRecord>>;
  create(input: CreateCategoryInput): Promise<CategoryRecord>;
  update(id: string, input: UpdateCategoryInput): Promise<CategoryRecord>;
}

export const createCategoryService = (categoryRepository: CategoryRepository): CategoryService => ({
  listPublic() {
    return categoryRepository.listPublic();
  },

  listAdmin(query) {
    const filters: CategoryListFilters = {
      page: query.page,
      limit: query.limit,
      sortOrder: query.sortOrder,
    };

    if (query.search !== undefined) {
      filters.search = query.search;
    }

    if (query.active !== undefined) {
      filters.isActive = query.active;
    }

    return categoryRepository.listAdmin(filters);
  },

  create(input) {
    return categoryRepository.create({
      name: input.name,
      slug: input.slug ?? createSlug(input.name),
      displayOrder: input.displayOrder,
      isActive: input.isActive,
    });
  },

  async update(id, input) {
    const existingCategory = await categoryRepository.findById(id);

    if (!existingCategory) {
      throw new HttpError(404, "CATEGORY_NOT_FOUND", "Category was not found");
    }

    const update: Partial<CategoryWriteData> = {};

    if (input.name !== undefined) {
      update.name = input.name;
    }
    if (input.slug !== undefined) {
      update.slug = input.slug;
    }
    if (input.displayOrder !== undefined) {
      update.displayOrder = input.displayOrder;
    }
    if (input.isActive !== undefined) {
      update.isActive = input.isActive;
    }
    const category = await categoryRepository.updateById(id, update);

    if (!category) {
      throw new HttpError(404, "CATEGORY_NOT_FOUND", "Category was not found");
    }

    return category;
  },
});
