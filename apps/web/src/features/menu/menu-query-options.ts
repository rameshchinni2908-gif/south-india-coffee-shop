import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { getCategories, getProducts, type ProductFilters } from "./menu-api.js";
import { getMenuFilterForm, getPage } from "./menu-filter-schema.js";

export const getMenuProductFilters = (searchParams: URLSearchParams): ProductFilters => {
  const form = getMenuFilterForm(searchParams);
  const [sortBy, sortOrder] = form.sort.split("-") as [
    ProductFilters["sortBy"],
    ProductFilters["sortOrder"],
  ];

  return {
    page: getPage(searchParams),
    limit: 12,
    available: form.available === "all" ? "all" : form.available === "true",
    sortBy,
    sortOrder,
    ...(form.search ? { search: form.search } : {}),
    ...(form.category ? { category: form.category } : {}),
    ...(form.vegetarian !== "all" ? { vegetarian: form.vegetarian === "true" } : {}),
  };
};

export const categoryQueryOptions = () =>
  queryOptions({
    queryKey: ["categories"],
    queryFn: ({ signal }) => getCategories(signal),
  });

export const productQueryOptions = (filters: ProductFilters) =>
  queryOptions({
    queryKey: ["products", filters],
    queryFn: ({ signal }) => getProducts(filters, signal),
  });

// Share the exact keys with the screen so slow in-flight requests are reused.
export const prefetchMenu = (
  client: QueryClient,
  location: Pick<Location, "pathname" | "search">,
) => {
  if (location.pathname !== "/") return;

  void client.prefetchQuery(categoryQueryOptions());
  void client.prefetchQuery(
    productQueryOptions(getMenuProductFilters(new URLSearchParams(location.search))),
  );
};
