import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  Pagination,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { ApiClientError } from "../../../lib/api-client.js";
import { formatRupees } from "../../../lib/currency.js";
import type { StaffUser } from "../../../types/auth.js";
import type { Product } from "../../../types/catalog.js";
import { archiveProduct } from "./admin-catalog-api.js";
import {
  ADMIN_PRODUCTS_QUERY_KEY,
  adminCategoriesQuery,
  adminProductsQuery,
} from "./admin-catalog-queries.js";
import { AvailabilityDialog } from "./AvailabilityDialog.js";
import { CategoryDialog } from "./CategoryDialog.js";
import { ProductEditorDialog } from "./ProductEditorDialog.js";

const getPriceLabel = (product: Product): string => {
  const prices = product.variants.map((variant) => variant.price);
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);

  return minimum === maximum
    ? formatRupees(minimum)
    : `${formatRupees(minimum)} – ${formatRupees(maximum)}`;
};

export const AdminProductsPage = () => {
  const { user } = useOutletContext<{ user: StaffUser }>();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorProduct, setEditorProduct] = useState<Product | null>(null);
  const [availabilityProduct, setAvailabilityProduct] = useState<Product | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const filters = useMemo(() => ({ page, search }), [page, search]);
  const productsQuery = useQuery(adminProductsQuery(filters));
  const categoriesQuery = useQuery(adminCategoriesQuery);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const archiveMutation = useMutation({
    mutationFn: archiveProduct,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_PRODUCTS_QUERY_KEY });
      setArchiveTarget(null);
    },
  });
  const archiveError =
    archiveMutation.error instanceof ApiClientError
      ? archiveMutation.error.message
      : archiveMutation.isError
        ? "The product could not be archived."
        : null;

  const openCreateProduct = () => {
    setEditorProduct(null);
    setEditorOpen(true);
  };

  const applySearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <Box component="main" sx={{ py: { xs: 4, md: 6 } }}>
      <Container maxWidth="xl">
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: { md: "flex-end" } }}
        >
          <Box>
            <Typography variant="overline" color="secondary.dark">
              Catalog
            </Typography>
            <Typography component="h1" variant="h3">
              Products
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75 }}>
              Manage customer-menu details, prices, stock, and ordering availability.
            </Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
            <Button
              variant="outlined"
              startIcon={<CategoryOutlinedIcon />}
              onClick={() => setCategoryOpen(true)}
            >
              Add category
            </Button>
            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={openCreateProduct}
              disabled={categories.length === 0}
            >
              Create product
            </Button>
          </Stack>
        </Stack>

        {categoriesQuery.isError && (
          <Alert severity="error" sx={{ mt: 3 }}>
            Categories could not be loaded. Product editing is temporarily unavailable.
          </Alert>
        )}
        {!categoriesQuery.isPending && !categoriesQuery.isError && categories.length === 0 && (
          <Alert severity="info" sx={{ mt: 3 }}>
            Create a category before adding your first product.
          </Alert>
        )}
        {archiveError && (
          <Alert severity="error" sx={{ mt: 3 }}>
            {archiveError}
          </Alert>
        )}

        <Stack
          component="form"
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          onSubmit={applySearch}
          sx={{ my: 4 }}
        >
          <TextField
            label="Search products"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            slotProps={{
              htmlInput: { maxLength: 100 },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ flex: 1, maxWidth: 520 }}
          />
          <Button type="submit" variant="outlined">
            Search
          </Button>
          {search && (
            <Button
              color="inherit"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </Stack>

        {productsQuery.isPending && (
          <Box
            aria-label="Loading products"
            sx={{ display: "grid", gridTemplateColumns: { md: "repeat(2, 1fr)" }, gap: 2 }}
          >
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} variant="rounded" height={260} />
            ))}
          </Box>
        )}
        {productsQuery.isError && (
          <Alert
            severity="error"
            action={<Button onClick={() => void productsQuery.refetch()}>Try again</Button>}
          >
            Products could not be loaded.
          </Alert>
        )}
        {productsQuery.data?.products.length === 0 && (
          <Alert severity="info">
            {search ? "No products match this search." : "No products have been created yet."}
          </Alert>
        )}
        {productsQuery.data && productsQuery.data.products.length > 0 && (
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" },
                gap: 2,
              }}
            >
              {productsQuery.data.products.map((product) => {
                const sellableVariants = product.variants.filter(
                  (variant) => variant.isAvailable && variant.stockQuantity > 0,
                ).length;
                const hasLowStock = product.variants.some(
                  (variant) => variant.stockQuantity <= product.lowStockThreshold,
                );

                return (
                  <Card key={product.id} variant="outlined" component="article">
                    <CardContent sx={{ p: 2.5 }}>
                      <Stack
                        direction="row"
                        spacing={2}
                        sx={{ justifyContent: "space-between", alignItems: "flex-start" }}
                      >
                        <Box>
                          <Typography
                            variant="caption"
                            color="secondary.dark"
                            sx={{ fontWeight: 800 }}
                          >
                            {categoriesById.get(product.categoryId) ?? "Uncategorized"}
                          </Typography>
                          <Typography component="h2" variant="h5" sx={{ fontWeight: 850 }}>
                            {product.name}
                          </Typography>
                        </Box>
                        <Stack
                          direction="row"
                          spacing={0.75}
                          useFlexGap
                          sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}
                        >
                          <Chip
                            size="small"
                            color={product.isActive ? "success" : "default"}
                            label={product.isActive ? "Active" : "Inactive"}
                          />
                          {hasLowStock && <Chip size="small" color="warning" label="Low stock" />}
                        </Stack>
                      </Stack>
                      <Typography color="text.secondary" sx={{ mt: 1, minHeight: 48 }}>
                        {product.description}
                      </Typography>
                      <Stack
                        direction="row"
                        spacing={2}
                        sx={{ mt: 2, justifyContent: "space-between" }}
                      >
                        <Typography sx={{ fontWeight: 850 }}>{getPriceLabel(product)}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {sellableVariants}/{product.variants.length} variants available
                        </Typography>
                      </Stack>
                      <Divider sx={{ my: 2 }} />
                      <Stack spacing={0.75}>
                        {product.variants.map((variant) => (
                          <Stack
                            key={variant.id}
                            direction="row"
                            spacing={2}
                            sx={{ justifyContent: "space-between" }}
                          >
                            <Typography variant="body2">
                              {variant.name} · {variant.sku}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 750 }}>
                              {variant.stockQuantity} in stock
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </CardContent>
                    <CardActions sx={{ px: 2.5, pb: 2.5, flexWrap: "wrap", gap: 1 }}>
                      <Button
                        startIcon={<EditOutlinedIcon />}
                        onClick={() => {
                          setEditorProduct(product);
                          setEditorOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        startIcon={<Inventory2OutlinedIcon />}
                        onClick={() => setAvailabilityProduct(product)}
                      >
                        Stock & availability
                      </Button>
                      {user.role === "ADMIN" && (
                        <Button
                          color="error"
                          startIcon={<ArchiveOutlinedIcon />}
                          onClick={() => setArchiveTarget(product)}
                        >
                          Archive
                        </Button>
                      )}
                    </CardActions>
                  </Card>
                );
              })}
            </Box>
            {productsQuery.data.meta.totalPages > 1 && (
              <Stack sx={{ mt: 4, alignItems: "center" }}>
                <Pagination
                  page={productsQuery.data.meta.page}
                  count={productsQuery.data.meta.totalPages}
                  onChange={(_event, nextPage) => setPage(nextPage)}
                  color="primary"
                />
              </Stack>
            )}
          </>
        )}
      </Container>

      {editorOpen && (
        <ProductEditorDialog
          key={editorProduct?.id ?? "new-product"}
          open
          product={editorProduct}
          categories={categories}
          onClose={() => setEditorOpen(false)}
        />
      )}
      {availabilityProduct && (
        <AvailabilityDialog
          key={availabilityProduct.id}
          product={availabilityProduct}
          onClose={() => setAvailabilityProduct(null)}
        />
      )}
      {categoryOpen && <CategoryDialog onClose={() => setCategoryOpen(false)} />}
      <Dialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Archive product?</DialogTitle>
        <DialogContent>
          <Typography>
            {archiveTarget?.name} will be removed from the customer menu. Historical orders will
            keep their product snapshots.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveTarget(null)} disabled={archiveMutation.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={archiveMutation.isPending || !archiveTarget}
            onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget.id)}
          >
            {archiveMutation.isPending ? "Archiving…" : "Archive product"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
