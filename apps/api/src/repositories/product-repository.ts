import { Types, type QueryFilter, type SortOrder } from "mongoose";

import { PriceHistoryModel } from "../models/price-history-model.js";
import { ProductModel } from "../models/product-model.js";
import type {
  PaginatedResult,
  PriceHistoryInput,
  ProductRecord,
  ProductVariantRecord,
} from "../types/catalog.js";
import { escapeRegExp } from "../utils/regex.js";

export interface ProductWriteData {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  imageUrl: string;
  isVegetarian: boolean;
  variants: ProductVariantRecord[];
  isActive: boolean;
  lowStockThreshold: number;
}

export interface ProductListFilters {
  page: number;
  limit: number;
  search?: string;
  categoryIds?: string[];
  isVegetarian?: boolean;
  availability?: boolean;
  isActive?: boolean;
  isArchived?: boolean;
  sortBy: "name" | "createdAt" | "updatedAt";
  sortOrder: "asc" | "desc";
}

export interface ProductRepository {
  list(filters: ProductListFilters): Promise<PaginatedResult<ProductRecord>>;
  findById(id: string): Promise<ProductRecord | null>;
  findPublicBySlug(slug: string, activeCategoryIds: string[]): Promise<ProductRecord | null>;
  create(data: ProductWriteData): Promise<ProductRecord>;
  updateById(
    id: string,
    data: Partial<ProductWriteData>,
    priceHistory: PriceHistoryInput[],
  ): Promise<ProductRecord | null>;
  archiveById(id: string, archivedBy: string): Promise<ProductRecord | null>;
}

const toVariantRecord = (
  variant: InstanceType<typeof ProductModel>["variants"][number],
): ProductVariantRecord => ({
  id: variant._id.toString(),
  name: variant.name,
  sku: variant.sku,
  price: variant.price,
  stockQuantity: variant.stockQuantity,
  isAvailable: variant.isAvailable,
});

const toProductRecord = (product: InstanceType<typeof ProductModel>): ProductRecord => ({
  id: product._id.toString(),
  name: product.name,
  slug: product.slug,
  description: product.description,
  categoryId: product.categoryId.toString(),
  imageUrl: product.imageUrl,
  isVegetarian: product.isVegetarian,
  variants: product.variants.map(toVariantRecord),
  isActive: product.isActive,
  isArchived: product.isArchived,
  archivedAt: product.archivedAt ?? null,
  archivedBy: product.archivedBy?.toString() ?? null,
  lowStockThreshold: product.lowStockThreshold,
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
});

const toPersistenceUpdate = (data: Partial<ProductWriteData>): Record<string, unknown> => {
  const update: Record<string, unknown> = { ...data };

  if (data.categoryId) {
    update.categoryId = new Types.ObjectId(data.categoryId);
  }

  if (data.variants) {
    update.variants = data.variants.map((variant) => ({
      _id: new Types.ObjectId(variant.id),
      name: variant.name,
      sku: variant.sku,
      price: variant.price,
      stockQuantity: variant.stockQuantity,
      isAvailable: variant.isAvailable,
    }));
  }

  return update;
};

export class MongooseProductRepository implements ProductRepository {
  public async list(filters: ProductListFilters): Promise<PaginatedResult<ProductRecord>> {
    const query: QueryFilter<InstanceType<typeof ProductModel>> = {};

    if (filters.search) {
      const expression = { $regex: escapeRegExp(filters.search), $options: "i" };
      query.$or = [
        { name: expression },
        { description: expression },
        { "variants.sku": expression },
      ];
    }

    if (filters.categoryIds) {
      query.categoryId = { $in: filters.categoryIds.map((id) => new Types.ObjectId(id)) };
    }

    if (filters.isVegetarian !== undefined) {
      query.isVegetarian = filters.isVegetarian;
    }

    if (filters.availability === true) {
      query.variants = { $elemMatch: { isAvailable: true, stockQuantity: { $gt: 0 } } };
    } else if (filters.availability === false) {
      query.variants = {
        $not: { $elemMatch: { isAvailable: true, stockQuantity: { $gt: 0 } } },
      };
    }

    if (filters.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    if (filters.isArchived !== undefined) {
      query.isArchived = filters.isArchived;
    }

    const skip = (filters.page - 1) * filters.limit;
    const direction: SortOrder = filters.sortOrder === "asc" ? 1 : -1;
    const sort = { [filters.sortBy]: direction };
    const [products, total] = await Promise.all([
      ProductModel.find(query).sort(sort).skip(skip).limit(filters.limit).exec(),
      ProductModel.countDocuments(query).exec(),
    ]);

    return {
      items: products.map(toProductRecord),
      meta: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  public async findById(id: string): Promise<ProductRecord | null> {
    const product = await ProductModel.findById(id).exec();

    return product ? toProductRecord(product) : null;
  }

  public async findPublicBySlug(
    slug: string,
    activeCategoryIds: string[],
  ): Promise<ProductRecord | null> {
    const product = await ProductModel.findOne({
      slug,
      categoryId: { $in: activeCategoryIds.map((id) => new Types.ObjectId(id)) },
      isActive: true,
      isArchived: false,
      variants: { $elemMatch: { isAvailable: true, stockQuantity: { $gt: 0 } } },
    }).exec();

    return product ? toProductRecord(product) : null;
  }

  public async create(data: ProductWriteData): Promise<ProductRecord> {
    const product = await ProductModel.create(toPersistenceUpdate(data));

    return toProductRecord(product);
  }

  public async updateById(
    id: string,
    data: Partial<ProductWriteData>,
    priceHistory: PriceHistoryInput[],
  ): Promise<ProductRecord | null> {
    const update = toPersistenceUpdate(data);

    if (priceHistory.length === 0) {
      const product = await ProductModel.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
      }).exec();

      return product ? toProductRecord(product) : null;
    }

    const session = await ProductModel.startSession();
    let product: InstanceType<typeof ProductModel> | null = null;

    try {
      await session.withTransaction(async () => {
        product = await ProductModel.findByIdAndUpdate(id, update, {
          new: true,
          runValidators: true,
          session,
        }).exec();

        if (product) {
          await PriceHistoryModel.insertMany(priceHistory, { session });
        }
      });
    } finally {
      await session.endSession();
    }

    return product ? toProductRecord(product) : null;
  }

  public async archiveById(id: string, archivedBy: string): Promise<ProductRecord | null> {
    const product = await ProductModel.findOneAndUpdate(
      { _id: id, isArchived: false },
      {
        isArchived: true,
        isActive: false,
        archivedAt: new Date(),
        archivedBy: new Types.ObjectId(archivedBy),
      },
      { new: true, runValidators: true },
    ).exec();

    return product ? toProductRecord(product) : null;
  }
}
