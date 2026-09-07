import { useQuery } from "@tanstack/react-query";

import type { ProductFilters } from "./menu-api.js";
import { categoryQueryOptions, productQueryOptions } from "./menu-query-options.js";

export const useCategories = () => useQuery(categoryQueryOptions());

export const useProducts = (filters: ProductFilters) => useQuery(productQueryOptions(filters));
