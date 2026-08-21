import type { UserRole } from "../models/user-model.js";

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductVariantRecord {
  id: string;
  name: string;
  sku: string;
  price: number;
  stockQuantity: number;
  isAvailable: boolean;
}

export interface ProductRecord {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  imageUrl: string;
  isVegetarian: boolean;
  variants: ProductVariantRecord[];
  isActive: boolean;
  isArchived: boolean;
  archivedAt: Date | null;
  archivedBy: string | null;
  lowStockThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PriceHistoryInput {
  productId: string;
  variantId: string;
  variantSku: string;
  oldPrice: number;
  newPrice: number;
  changedBy: string;
  changedAt: Date;
}

export interface StaffIdentity {
  id: string;
  role: UserRole;
}
