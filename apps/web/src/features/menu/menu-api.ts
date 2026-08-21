import { apiGet } from "../../lib/api-client.js";
import type { PaginationMeta } from "../../types/api.js";
import type { Category, Product } from "../../types/catalog.js";

export interface ProductFilters {
  page: number;
  limit: number;
  search?: string;
  category?: string;
  available: boolean;
  vegetarian?: boolean;
  sortBy: "name" | "createdAt" | "updatedAt";
  sortOrder: "asc" | "desc";
}

export const getCategories = async (signal?: AbortSignal): Promise<Category[]> => {
  const response = await apiGet<{ categories: Category[] }>("/api/categories", signal);

  return response.data.categories;
};

export const getProducts = async (
  filters: ProductFilters,
  signal?: AbortSignal,
): Promise<{ products: Product[]; meta: PaginationMeta }> => {
  const searchParams = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
    available: String(filters.available),
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  });

  if (filters.search) {
    searchParams.set("search", filters.search);
  }
  if (filters.category) {
    searchParams.set("category", filters.category);
  }
  if (filters.vegetarian !== undefined) {
    searchParams.set("vegetarian", String(filters.vegetarian));
  }

  const response = await apiGet<{ products: Product[] }, PaginationMeta>(
    `/api/products?${searchParams.toString()}`,
    signal,
  );

  return { products: response.data.products, meta: response.meta };
};
