import type { QueryFilter } from "mongoose";

import { CategoryModel } from "../models/category-model.js";
import type { CategoryRecord, PaginatedResult } from "../types/catalog.js";
import { escapeRegExp } from "../utils/regex.js";

export interface CategoryWriteData {
  name: string;
  slug: string;
  displayOrder: number;
  isActive: boolean;
}

export interface CategoryListFilters {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
  sortOrder: "asc" | "desc";
}

export interface CategoryRepository {
  listPublic(): Promise<CategoryRecord[]>;
  listAdmin(filters: CategoryListFilters): Promise<PaginatedResult<CategoryRecord>>;
  listActiveIds(): Promise<string[]>;
  findById(id: string): Promise<CategoryRecord | null>;
  findActiveBySlug(slug: string): Promise<CategoryRecord | null>;
  create(data: CategoryWriteData): Promise<CategoryRecord>;
  updateById(id: string, data: Partial<CategoryWriteData>): Promise<CategoryRecord | null>;
}

const toCategoryRecord = (category: InstanceType<typeof CategoryModel>): CategoryRecord => ({
  id: category._id.toString(),
  name: category.name,
  slug: category.slug,
  displayOrder: category.displayOrder,
  isActive: category.isActive,
  createdAt: category.createdAt,
  updatedAt: category.updatedAt,
});

export class MongooseCategoryRepository implements CategoryRepository {
  public async listPublic(): Promise<CategoryRecord[]> {
    const categories = await CategoryModel.find({ isActive: true })
      .sort({ displayOrder: 1, name: 1 })
      .exec();

    return categories.map(toCategoryRecord);
  }

  public async listAdmin(filters: CategoryListFilters): Promise<PaginatedResult<CategoryRecord>> {
    const query: QueryFilter<InstanceType<typeof CategoryModel>> = {};

    if (filters.search) {
      query.name = { $regex: escapeRegExp(filters.search), $options: "i" };
    }

    if (filters.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    const skip = (filters.page - 1) * filters.limit;
    const direction = filters.sortOrder === "asc" ? 1 : -1;
    const [categories, total] = await Promise.all([
      CategoryModel.find(query)
        .sort({ displayOrder: direction, name: 1 })
        .skip(skip)
        .limit(filters.limit)
        .exec(),
      CategoryModel.countDocuments(query).exec(),
    ]);

    return {
      items: categories.map(toCategoryRecord),
      meta: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  public async listActiveIds(): Promise<string[]> {
    const categories = await CategoryModel.find({ isActive: true }).select("_id").exec();

    return categories.map((category) => category._id.toString());
  }

  public async findById(id: string): Promise<CategoryRecord | null> {
    const category = await CategoryModel.findById(id).exec();

    return category ? toCategoryRecord(category) : null;
  }

  public async findActiveBySlug(slug: string): Promise<CategoryRecord | null> {
    const category = await CategoryModel.findOne({ slug, isActive: true }).exec();

    return category ? toCategoryRecord(category) : null;
  }

  public async create(data: CategoryWriteData): Promise<CategoryRecord> {
    const category = await CategoryModel.create(data);

    return toCategoryRecord(category);
  }

  public async updateById(
    id: string,
    data: Partial<CategoryWriteData>,
  ): Promise<CategoryRecord | null> {
    const category = await CategoryModel.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).exec();

    return category ? toCategoryRecord(category) : null;
  }
}
