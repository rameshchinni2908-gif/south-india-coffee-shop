import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";

import { ApiClientError } from "../../../lib/api-client.js";
import type { Product } from "../../../types/catalog.js";
import { updateAvailability } from "./admin-catalog-api.js";
import { ADMIN_PRODUCTS_QUERY_KEY } from "./admin-catalog-queries.js";
import { availabilityFormSchema, type AvailabilityFormValues } from "./product-form-schema.js";

interface AvailabilityDialogProps {
  product: Product;
  onClose(): void;
}

export const AvailabilityDialog = ({ product, onClose }: AvailabilityDialogProps) => {
  const queryClient = useQueryClient();
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<AvailabilityFormValues>({
    resolver: zodResolver(availabilityFormSchema),
    defaultValues: {
      variants: product.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        stockQuantity: String(variant.stockQuantity),
        isAvailable: variant.isAvailable,
      })),
    },
  });
  const updateMutation = useMutation({
    mutationFn: (values: AvailabilityFormValues) =>
      updateAvailability(product.id, {
        variants: values.variants.map((variant) => ({
          id: variant.id,
          stockQuantity: Number(variant.stockQuantity),
          isAvailable: variant.isAvailable,
        })),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_PRODUCTS_QUERY_KEY });
      onClose();
    },
  });
  const errorMessage =
    updateMutation.error instanceof ApiClientError
      ? updateMutation.error.message
      : updateMutation.isError
        ? "Stock and availability could not be updated."
        : null;

  return (
    <Dialog open onClose={updateMutation.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Stock and availability · {product.name}</DialogTitle>
      <DialogContent dividers>
        <Stack
          id="availability-form"
          component="form"
          spacing={2.5}
          onSubmit={(event) => void handleSubmit((values) => updateMutation.mutate(values))(event)}
        >
          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
          {product.variants.map((variant, index) => (
            <Stack
              key={variant.id}
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
            >
              <Typography sx={{ fontWeight: 800 }}>{variant.name}</Typography>
              <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                <TextField
                  label="Stock"
                  type="number"
                  size="small"
                  {...register(`variants.${index}.stockQuantity`)}
                  error={Boolean(errors.variants?.[index]?.stockQuantity)}
                  helperText={errors.variants?.[index]?.stockQuantity?.message}
                  slotProps={{ htmlInput: { min: 0, step: 1 } }}
                  sx={{ width: 130 }}
                />
                <Controller
                  control={control}
                  name={`variants.${index}.isAvailable`}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch checked={field.value} onChange={field.onChange} />}
                      label="Available"
                    />
                  )}
                />
              </Stack>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={updateMutation.isPending}>
          Cancel
        </Button>
        <Button
          form="availability-form"
          type="submit"
          variant="contained"
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? "Saving…" : "Save stock"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
