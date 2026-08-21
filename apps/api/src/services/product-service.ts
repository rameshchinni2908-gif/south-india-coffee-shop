import { Types } from "mongoose";

import { HttpError } from "../middleware/http-error.js";
import type { CategoryRepository } from "../repositories/category-repository.js";
import type {
  ProductListFilters,
  ProductRepository,
  ProductWriteData,
} from "../repositories/product-repository.js";
import type {
  PaginatedResult,
  PriceHistoryInput,
  ProductRecord,
  ProductVariantRecord,
  StaffIdentity,
} from "../types/catalog.js";
import { createSlug } from "../utils/slug.js";
import type {
  AdminProductQuery,
  CreateProductInput,
  PublicProductQuery,
  UpdateAvailabilityInput,
  UpdateProductInput,
} from "../validation/catalog-schemas.js";

export interface ProductService {
  listPublic(query: PublicProductQuery): Promise<PaginatedResult<ProductRecord>>;
  getPublicBySlug(slug: string): Promise<ProductRecord>;
  listAdmin(query: AdminProductQuery): Promise<PaginatedResult<ProductRecord>>;
  getAdminById(id: string): Promise<ProductRecord>;
  create(input: CreateProductInput): Promise<ProductRecord>;
  update(id: string, input: UpdateProductInput, changedBy: string): Promise<ProductRecord>;
  updateAvailability(id: string, input: UpdateAvailabilityInput): Promise<ProductRecord>;
  archive(id: string, actor: StaffIdentity): Promise<ProductRecord>;
}

const ensureCategoryExists = async (
  categoryRepository: CategoryRepository,
  categoryId: string,
): Promise<void> => {
  const category = await categoryRepository.findById(categoryId);

  if (!category) {
    throw new HttpError(400, "CATEGORY_NOT_FOUND", "The selected category does not exist");
  }
};

const toNewVariant = (variant: CreateProductInput["variants"][number]): ProductVariantRecord => ({
  id: new Types.ObjectId().toString(),
  name: variant.name,
  sku: variant.sku,
  price: variant.price,
  stockQuantity: variant.stockQuantity,
  isAvailable: variant.isAvailable,
});

const mergeVariants = (
  existingProduct: ProductRecord,
  variants: NonNullable<UpdateProductInput["variants"]>,
): ProductVariantRecord[] => {
  const existingById = new Map(existingProduct.variants.map((variant) => [variant.id, variant]));

  return variants.map((variant) => {
    if (variant.id && !existingById.has(variant.id)) {
      throw new HttpError(400, "VARIANT_NOT_FOUND", "A variant does not belong to this product");
    }

    return {
      id: variant.id ?? new Types.ObjectId().toString(),
      name: variant.name,
      sku: variant.sku,
      price: variant.price,
      stockQuantity: variant.stockQuantity,
      isAvailable: variant.isAvailable,
    };
  });
};

const createPriceHistory = (
  product: ProductRecord,
  variants: ProductVariantRecord[],
  changedBy: string,
): PriceHistoryInput[] => {
  const existingById = new Map(product.variants.map((variant) => [variant.id, variant]));
  const changedAt = new Date();

  return variants.flatMap((variant) => {
    const existing = existingById.get(variant.id);

    if (!existing || existing.price === variant.price) {
      return [];
    }

    return [
      {
        productId: product.id,
        variantId: variant.id,
        variantSku: variant.sku,
        oldPrice: existing.price,
        newPrice: variant.price,
        changedBy,
        changedAt,
      },
    ];
  });
};

const ensureEditable = (product: ProductRecord): void => {
  if (product.isArchived) {
    throw new HttpError(409, "PRODUCT_ARCHIVED", "Archived products cannot be modified");
  }
};

export const createProductService = (
  productRepository: ProductRepository,
  categoryRepository: CategoryRepository,
): ProductService => ({
  async listPublic(query) {
    let categoryIds: string[];

    if (query.category) {
      const category = await categoryRepository.findActiveBySlug(query.category);

      if (!category) {
        return {
          items: [],
          meta: { page: query.page, limit: query.limit, total: 0, totalPages: 0 },
        };
      }

      categoryIds = [category.id];
    } else {
      categoryIds = await categoryRepository.listActiveIds();
    }

    if (categoryIds.length === 0) {
      return {
        items: [],
        meta: { page: query.page, limit: query.limit, total: 0, totalPages: 0 },
      };
    }

    const filters: ProductListFilters = {
      page: query.page,
      limit: query.limit,
      categoryIds,
      availability: query.available ?? true,
      isActive: true,
      isArchived: false,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };

    if (query.search !== undefined) {
      filters.search = query.search;
    }

    if (query.vegetarian !== undefined) {
      filters.isVegetarian = query.vegetarian;
    }

    return productRepository.list(filters);
  },

  async getPublicBySlug(slug) {
    const activeCategoryIds = await categoryRepository.listActiveIds();
    const product = await productRepository.findPublicBySlug(slug, activeCategoryIds);

    if (!product) {
      throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product was not found");
    }

    return product;
  },

  listAdmin(query) {
    const filters: ProductListFilters = {
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };

    if (query.search !== undefined) {
      filters.search = query.search;
    }
    if (query.categoryId !== undefined) {
      filters.categoryIds = [query.categoryId];
    }
    if (query.vegetarian !== undefined) {
      filters.isVegetarian = query.vegetarian;
    }
    if (query.available !== undefined) {
      filters.availability = query.available;
    }
    if (query.active !== undefined) {
      filters.isActive = query.active;
    }
    if (query.archived !== undefined) {
      filters.isArchived = query.archived;
    }

    return productRepository.list(filters);
  },

  async getAdminById(id) {
    const product = await productRepository.findById(id);

    if (!product) {
      throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product was not found");
    }

    return product;
  },

  async create(input) {
    await ensureCategoryExists(categoryRepository, input.categoryId);

    return productRepository.create({
      name: input.name,
      slug: input.slug ?? createSlug(input.name),
      description: input.description,
      categoryId: input.categoryId,
      imageUrl: input.imageUrl,
      isVegetarian: input.isVegetarian,
      variants: input.variants.map(toNewVariant),
      isActive: input.isActive,
      lowStockThreshold: input.lowStockThreshold,
    });
  },

  async update(id, input, changedBy) {
    const existingProduct = await productRepository.findById(id);

    if (!existingProduct) {
      throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product was not found");
    }

    ensureEditable(existingProduct);

    if (input.categoryId) {
      await ensureCategoryExists(categoryRepository, input.categoryId);
    }

    const update: Partial<ProductWriteData> = {};
    let priceHistory: PriceHistoryInput[] = [];

    if (input.name !== undefined) {
      update.name = input.name;
    }
    if (input.slug !== undefined) {
      update.slug = input.slug;
    }
    if (input.description !== undefined) {
      update.description = input.description;
    }
    if (input.categoryId !== undefined) {
      update.categoryId = input.categoryId;
    }
    if (input.imageUrl !== undefined) {
      update.imageUrl = input.imageUrl;
    }
    if (input.isVegetarian !== undefined) {
      update.isVegetarian = input.isVegetarian;
    }
    if (input.isActive !== undefined) {
      update.isActive = input.isActive;
    }
    if (input.lowStockThreshold !== undefined) {
      update.lowStockThreshold = input.lowStockThreshold;
    }

    if (input.variants) {
      update.variants = mergeVariants(existingProduct, input.variants);
      priceHistory = createPriceHistory(existingProduct, update.variants, changedBy);
    }

    const product = await productRepository.updateById(id, update, priceHistory);

    if (!product) {
      throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product was not found");
    }

    return product;
  },

  async updateAvailability(id, input) {
    const existingProduct = await productRepository.findById(id);

    if (!existingProduct) {
      throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product was not found");
    }

    ensureEditable(existingProduct);
    const updatesById = new Map(input.variants.map((variant) => [variant.id, variant]));

    for (const variantId of updatesById.keys()) {
      if (!existingProduct.variants.some((variant) => variant.id === variantId)) {
        throw new HttpError(400, "VARIANT_NOT_FOUND", "A variant does not belong to this product");
      }
    }

    const variants = existingProduct.variants.map((variant) => {
      const update = updatesById.get(variant.id);

      if (!update) {
        return variant;
      }

      return {
        ...variant,
        stockQuantity: update.stockQuantity ?? variant.stockQuantity,
        isAvailable: update.isAvailable ?? variant.isAvailable,
      };
    });
    const product = await productRepository.updateById(id, { variants }, []);

    if (!product) {
      throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product was not found");
    }

    return product;
  },

  async archive(id, actor) {
    if (actor.role !== "ADMIN") {
      throw new HttpError(403, "FORBIDDEN", "Only an ADMIN can archive products");
    }

    const product = await productRepository.archiveById(id, actor.id);

    if (!product) {
      throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product was not found");
    }

    return product;
  },
});
