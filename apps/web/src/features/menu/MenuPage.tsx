import { Alert, Box, Container, Pagination, Stack, Typography } from "@mui/material";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { SiteHeader } from "../../components/SiteHeader.js";
import type { Category } from "../../types/catalog.js";
import { MenuFilters } from "./MenuFilters.js";
import { MenuHero } from "./MenuHero.js";
import { getMenuFilterForm, getPage, type MenuFilterForm } from "./menu-filter-schema.js";
import { useCategories, useProducts } from "./menu-queries.js";
import { MenuEmptyState, MenuErrorState, MenuLoadingState } from "./MenuStates.js";
import { ProductCard } from "./ProductCard.js";

const PAGE_SIZE = 12;

const getCategoryName = (categories: Category[], categoryId: string): string | undefined =>
  categories.find((category) => category.id === categoryId)?.name;

export const MenuPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const filterForm = useMemo(() => getMenuFilterForm(searchParams), [searchParams]);
  const page = getPage(searchParams);
  const categoriesQuery = useCategories();
  const productFilters = useMemo(() => {
    const [sortBy, sortOrder] = filterForm.sort.split("-") as [
      "name" | "createdAt" | "updatedAt",
      "asc" | "desc",
    ];
    const filters = {
      page,
      limit: PAGE_SIZE,
      available: filterForm.available === "true",
      sortBy,
      sortOrder,
    } as const;

    return {
      ...filters,
      ...(filterForm.search ? { search: filterForm.search } : {}),
      ...(filterForm.category ? { category: filterForm.category } : {}),
      ...(filterForm.vegetarian !== "all" ? { vegetarian: filterForm.vegetarian === "true" } : {}),
    };
  }, [filterForm, page]);
  const productsQuery = useProducts(productFilters);
  const categories = categoriesQuery.data ?? [];

  const applyFilters = (values: MenuFilterForm) => {
    const nextParams = new URLSearchParams();

    if (values.search) {
      nextParams.set("search", values.search);
    }
    if (values.category) {
      nextParams.set("category", values.category);
    }
    if (values.available === "false") {
      nextParams.set("available", "false");
    }
    if (values.vegetarian !== "all") {
      nextParams.set("vegetarian", values.vegetarian);
    }
    if (values.sort !== "name-asc") {
      nextParams.set("sort", values.sort);
    }

    setSearchParams(nextParams);
  };

  const clearFilters = () => setSearchParams(new URLSearchParams());

  const changePage = (_event: React.ChangeEvent<unknown>, nextPage: number) => {
    const nextParams = new URLSearchParams(searchParams);

    if (nextPage === 1) {
      nextParams.delete("page");
    } else {
      nextParams.set("page", String(nextPage));
    }

    setSearchParams(nextParams);
    document.getElementById("menu-results")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <a className="skip-link" href="#menu-results">
        Skip to menu
      </a>
      <SiteHeader />
      <MenuHero />

      <Box component="main" id="menu-results" tabIndex={-1} sx={{ py: { xs: 5, md: 8 } }}>
        <Container maxWidth="lg">
          <MenuFilters
            categories={categories}
            categoriesLoading={categoriesQuery.isPending}
            values={filterForm}
            onApply={applyFilters}
            onClear={clearFilters}
          />

          {categoriesQuery.isError && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Categories are temporarily unavailable. You can still browse the full menu.
            </Alert>
          )}

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{
              mt: { xs: 5, md: 7 },
              mb: 2.5,
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "flex-end" },
            }}
          >
            <Box>
              <Typography component="h2" variant="h3">
                Today’s menu
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.75 }} aria-live="polite">
                {productsQuery.data
                  ? `${productsQuery.data.meta.total} ${productsQuery.data.meta.total === 1 ? "item" : "items"}`
                  : "Fresh choices for pickup"}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Prices include the selected size and are shown in INR.
            </Typography>
          </Stack>

          {productsQuery.isPending && <MenuLoadingState />}
          {productsQuery.isError && <MenuErrorState onRetry={() => void productsQuery.refetch()} />}
          {productsQuery.data && productsQuery.data.products.length === 0 && (
            <MenuEmptyState onClear={clearFilters} />
          )}
          {productsQuery.data && productsQuery.data.products.length > 0 && (
            <>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                    lg: "repeat(3, minmax(0, 1fr))",
                  },
                  gap: 2.5,
                }}
              >
                {productsQuery.data.products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    categoryName={getCategoryName(categories, product.categoryId)}
                  />
                ))}
              </Box>

              {productsQuery.data.meta.totalPages > 1 && (
                <Stack sx={{ mt: 5, alignItems: "center" }}>
                  <Pagination
                    page={productsQuery.data.meta.page}
                    count={productsQuery.data.meta.totalPages}
                    color="primary"
                    size="large"
                    onChange={changePage}
                    aria-label="Menu pagination"
                  />
                </Stack>
              )}
            </>
          )}
        </Container>
      </Box>

      <Box
        component="footer"
        sx={{ py: 4, borderTop: "1px solid", borderColor: "divider", bgcolor: "#f5eadb" }}
      >
        <Container maxWidth="lg">
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
            Pickup orders are paid at the shop. Availability may change during busy hours.
          </Typography>
        </Container>
      </Box>
    </>
  );
};
