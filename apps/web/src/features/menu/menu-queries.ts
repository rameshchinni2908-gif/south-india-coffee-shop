import { useQuery } from "@tanstack/react-query";

import { getCategories, getProducts, type ProductFilters } from "./menu-api.js";

export const useCategories = () =>
  useQuery({
    queryKey: ["categories"],
    queryFn: ({ signal }) => getCategories(signal),
  });

export const useProducts = (filters: ProductFilters) =>
  useQuery({
    queryKey: ["products", filters],
    queryFn: ({ signal }) => getProducts(filters, signal),
  });
