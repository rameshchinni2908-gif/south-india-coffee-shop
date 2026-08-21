import { queryOptions } from "@tanstack/react-query";

import { getAdminCategories, getAdminProducts } from "./admin-catalog-api.js";

export const ADMIN_PRODUCTS_QUERY_KEY = ["admin", "products"] as const;
export const ADMIN_CATEGORIES_QUERY_KEY = ["admin", "categories"] as const;

export const adminProductsQuery = (filters: { page: number; search: string }) =>
  queryOptions({
    queryKey: [...ADMIN_PRODUCTS_QUERY_KEY, filters],
    queryFn: ({ signal }) => getAdminProducts(filters, signal),
  });

export const adminCategoriesQuery = queryOptions({
  queryKey: ADMIN_CATEGORIES_QUERY_KEY,
  queryFn: ({ signal }) => getAdminCategories(signal),
  staleTime: 60_000,
});
