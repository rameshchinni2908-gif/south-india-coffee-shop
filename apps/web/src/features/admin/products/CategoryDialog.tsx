import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";

import { ApiClientError } from "../../../lib/api-client.js";
import { createCategory } from "./admin-catalog-api.js";
import { ADMIN_CATEGORIES_QUERY_KEY } from "./admin-catalog-queries.js";
import { categoryFormSchema, type CategoryFormValues } from "./product-form-schema.js";

export const CategoryDialog = ({ onClose }: { onClose(): void }) => {
  const queryClient = useQueryClient();
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: "", displayOrder: "0", isActive: true },
  });
  const createMutation = useMutation({
    mutationFn: (values: CategoryFormValues) =>
      createCategory({
        name: values.name,
        displayOrder: Number(values.displayOrder),
        isActive: values.isActive,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_CATEGORIES_QUERY_KEY });
      onClose();
    },
  });
  const errorMessage =
    createMutation.error instanceof ApiClientError
      ? createMutation.error.message
      : createMutation.isError
        ? "The category could not be created."
        : null;

  return (
    <Dialog open onClose={createMutation.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Create category</DialogTitle>
      <DialogContent dividers>
        <Stack
          id="category-form"
          component="form"
          spacing={2}
          onSubmit={(event) => void handleSubmit((values) => createMutation.mutate(values))(event)}
        >
          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
          <TextField
            label="Category name"
            {...register("name")}
            error={Boolean(errors.name)}
            helperText={errors.name?.message}
          />
          <TextField
            label="Display order"
            type="number"
            {...register("displayOrder")}
            error={Boolean(errors.displayOrder)}
            helperText={errors.displayOrder?.message}
            slotProps={{ htmlInput: { min: 0, step: 1 } }}
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={createMutation.isPending}>
          Cancel
        </Button>
        <Button
          form="category-form"
          type="submit"
          variant="contained"
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? "Creating…" : "Create category"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
