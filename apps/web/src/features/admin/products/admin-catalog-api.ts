import { apiDelete, apiGet, apiPatch, apiPost } from "../../../lib/api-client.js";
import type { PaginationMeta } from "../../../types/api.js";
import type { Category, Product } from "../../../types/catalog.js";

export interface ProductVariantInput {
  id?: string;
  name: string;
  sku: string;
  price: number;
  stockQuantity: number;
  isAvailable: boolean;
}

export interface ProductInput {
  name: string;
  description: string;
  categoryId: string;
  imageUrl: string;
  isVegetarian: boolean;
  variants: ProductVariantInput[];
  isActive: boolean;
  lowStockThreshold: number;
}

export interface AvailabilityInput {
  variants: Array<{ id: string; stockQuantity: number; isAvailable: boolean }>;
}

export interface CategoryInput {
  name: string;
  displayOrder: number;
  isActive: boolean;
}

export const getAdminProducts = async (
  filters: { page: number; search: string },
  signal?: AbortSignal,
): Promise<{ products: Product[]; meta: PaginationMeta }> => {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: "12",
    archived: "false",
    sortBy: "updatedAt",
    sortOrder: "desc",
  });

  if (filters.search) {
    params.set("search", filters.search);
  }

  const response = await apiGet<{ products: Product[] }, PaginationMeta>(
    `/api/admin/products?${params.toString()}`,
    signal,
  );

  return { products: response.data.products, meta: response.meta };
};

export const getAdminCategories = async (signal?: AbortSignal): Promise<Category[]> => {
  const response = await apiGet<{ categories: Category[] }, PaginationMeta>(
    "/api/admin/categories?limit=100&sortOrder=asc",
    signal,
  );

  return response.data.categories;
};

export const createProduct = async (input: ProductInput): Promise<Product> => {
  const response = await apiPost<{ product: Product }, ProductInput>("/api/admin/products", input);

  return response.data.product;
};

export const updateProduct = async (id: string, input: ProductInput): Promise<Product> => {
  const response = await apiPatch<{ product: Product }, ProductInput>(
    `/api/admin/products/${id}`,
    input,
  );

  return response.data.product;
};

export const updateAvailability = async (
  id: string,
  input: AvailabilityInput,
): Promise<Product> => {
  const response = await apiPatch<{ product: Product }, AvailabilityInput>(
    `/api/admin/products/${id}/availability`,
    input,
  );

  return response.data.product;
};

export const archiveProduct = async (id: string): Promise<Product> => {
  const response = await apiDelete<{ product: Product }>(`/api/admin/products/${id}`);

  return response.data.product;
};

export const createCategory = async (input: CategoryInput): Promise<Category> => {
  const response = await apiPost<{ category: Category }, CategoryInput>(
    "/api/admin/categories",
    input,
  );

  return response.data.category;
};
