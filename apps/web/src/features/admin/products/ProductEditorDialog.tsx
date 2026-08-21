import { zodResolver } from "@hookform/resolvers/zod";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useFieldArray, useForm } from "react-hook-form";

import { ApiClientError } from "../../../lib/api-client.js";
import type { Category, Product } from "../../../types/catalog.js";
import { createProduct, updateProduct, type ProductInput } from "./admin-catalog-api.js";
import { ADMIN_PRODUCTS_QUERY_KEY } from "./admin-catalog-queries.js";
import { productFormSchema, type ProductFormValues } from "./product-form-schema.js";

interface ProductEditorDialogProps {
  open: boolean;
  product: Product | null;
  categories: Category[];
  onClose(): void;
}

const emptyVariant = {
  name: "Regular",
  sku: "",
  priceRupees: "0.00",
  stockQuantity: "0",
  isAvailable: true,
};

const getDefaultValues = (product: Product | null, categories: Category[]): ProductFormValues => ({
  name: product?.name ?? "",
  description: product?.description ?? "",
  categoryId: product?.categoryId ?? categories.find((category) => category.isActive)?.id ?? "",
  imageUrl: product?.imageUrl ?? "",
  isVegetarian: product?.isVegetarian ?? true,
  isActive: product?.isActive ?? true,
  lowStockThreshold: String(product?.lowStockThreshold ?? 5),
  variants: product?.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    sku: variant.sku,
    priceRupees: (variant.price / 100).toFixed(2),
    stockQuantity: String(variant.stockQuantity),
    isAvailable: variant.isAvailable,
  })) ?? [emptyVariant],
});

const toProductInput = (values: ProductFormValues): ProductInput => ({
  name: values.name,
  description: values.description,
  categoryId: values.categoryId,
  imageUrl: values.imageUrl,
  isVegetarian: values.isVegetarian,
  isActive: values.isActive,
  lowStockThreshold: Number(values.lowStockThreshold),
  variants: values.variants.map((variant) => ({
    ...(variant.id ? { id: variant.id } : {}),
    name: variant.name,
    sku: variant.sku,
    price: Math.round(Number(variant.priceRupees) * 100),
    stockQuantity: Number(variant.stockQuantity),
    isAvailable: variant.isAvailable,
  })),
});

export const ProductEditorDialog = ({
  open,
  product,
  categories,
  onClose,
}: ProductEditorDialogProps) => {
  const queryClient = useQueryClient();
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: getDefaultValues(product, categories),
  });
  const variants = useFieldArray({ control, name: "variants" });
  const saveMutation = useMutation({
    mutationFn: (values: ProductFormValues) => {
      const input = toProductInput(values);

      return product ? updateProduct(product.id, input) : createProduct(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_PRODUCTS_QUERY_KEY });
      onClose();
    },
  });
  const saveError =
    saveMutation.error instanceof ApiClientError
      ? saveMutation.error.message
      : saveMutation.isError
        ? "The product could not be saved."
        : null;

  return (
    <Dialog
      open={open}
      onClose={saveMutation.isPending ? undefined : onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>{product ? `Edit ${product.name}` : "Create product"}</DialogTitle>
      <DialogContent dividers>
        <Stack
          id="product-editor-form"
          component="form"
          noValidate
          spacing={2.5}
          onSubmit={(event) => void handleSubmit((values) => saveMutation.mutate(values))(event)}
        >
          {saveError && <Alert severity="error">{saveError}</Alert>}
          <TextField
            label="Product name"
            {...register("name")}
            error={Boolean(errors.name)}
            helperText={errors.name?.message}
          />
          <TextField
            label="Description"
            multiline
            minRows={3}
            {...register("description")}
            error={Boolean(errors.description)}
            helperText={errors.description?.message}
          />
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <TextField
                select
                label="Category"
                {...field}
                error={Boolean(errors.categoryId)}
                helperText={errors.categoryId?.message}
              >
                {categories.map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    {category.name}
                    {category.isActive ? "" : " (inactive)"}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <TextField
            label="Image URL (optional)"
            {...register("imageUrl")}
            error={Boolean(errors.imageUrl)}
            helperText={errors.imageUrl?.message}
          />
          <TextField
            label="Low-stock threshold"
            type="number"
            {...register("lowStockThreshold")}
            error={Boolean(errors.lowStockThreshold)}
            helperText={errors.lowStockThreshold?.message}
            slotProps={{ htmlInput: { min: 0, step: 1 } }}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Controller
              control={control}
              name="isVegetarian"
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox checked={field.value} onChange={field.onChange} />}
                  label="Vegetarian"
                />
              )}
            />
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox checked={field.value} onChange={field.onChange} />}
                  label="Active on customer menu"
                />
              )}
            />
          </Stack>

          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography component="h3" variant="h6" sx={{ fontWeight: 850 }}>
              Variants
            </Typography>
            <Button
              startIcon={<AddRoundedIcon />}
              onClick={() => variants.append({ ...emptyVariant, name: "", sku: "" })}
            >
              Add variant
            </Button>
          </Stack>
          {typeof errors.variants?.message === "string" && (
            <Alert severity="error">{errors.variants.message}</Alert>
          )}
          {variants.fields.map((field, index) => (
            <Paper key={field.id} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  sx={{ justifyContent: "space-between", alignItems: "center" }}
                >
                  <Typography sx={{ fontWeight: 800 }}>Variant {index + 1}</Typography>
                  <IconButton
                    color="error"
                    disabled={variants.fields.length === 1}
                    onClick={() => variants.remove(index)}
                    aria-label={`Remove variant ${index + 1}`}
                  >
                    <DeleteOutlineRoundedIcon />
                  </IconButton>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    fullWidth
                    label="Variant name"
                    {...register(`variants.${index}.name`)}
                    error={Boolean(errors.variants?.[index]?.name)}
                    helperText={errors.variants?.[index]?.name?.message}
                  />
                  <TextField
                    fullWidth
                    label="SKU"
                    {...register(`variants.${index}.sku`)}
                    error={Boolean(errors.variants?.[index]?.sku)}
                    helperText={errors.variants?.[index]?.sku?.message}
                  />
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    fullWidth
                    label="Price (₹)"
                    type="number"
                    {...register(`variants.${index}.priceRupees`)}
                    error={Boolean(errors.variants?.[index]?.priceRupees)}
                    helperText={errors.variants?.[index]?.priceRupees?.message}
                    slotProps={{ htmlInput: { min: 0, step: "0.01" } }}
                  />
                  <TextField
                    fullWidth
                    label="Stock quantity"
                    type="number"
                    {...register(`variants.${index}.stockQuantity`)}
                    error={Boolean(errors.variants?.[index]?.stockQuantity)}
                    helperText={errors.variants?.[index]?.stockQuantity?.message}
                    slotProps={{ htmlInput: { min: 0, step: 1 } }}
                  />
                </Stack>
                <Controller
                  control={control}
                  name={`variants.${index}.isAvailable`}
                  render={({ field: availableField }) => (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={availableField.value}
                          onChange={availableField.onChange}
                        />
                      }
                      label="Available for ordering"
                    />
                  )}
                />
              </Stack>
            </Paper>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saveMutation.isPending}>
          Cancel
        </Button>
        <Button
          form="product-editor-form"
          type="submit"
          variant="contained"
          disabled={saveMutation.isPending || categories.length === 0}
        >
          {saveMutation.isPending ? "Saving…" : "Save product"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
