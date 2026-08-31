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
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { ApiClientError } from "../../../lib/api-client.js";
import type { Category } from "../../../types/catalog.js";
import { createCategory, updateCategory } from "./admin-catalog-api.js";
import { ADMIN_CATEGORIES_QUERY_KEY } from "./admin-catalog-queries.js";
import { categoryFormSchema, type CategoryFormValues } from "./product-form-schema.js";

export const CategoryDialog = ({
  categories,
  onClose,
}: {
  categories: Category[];
  onClose(): void;
}) => {
  const queryClient = useQueryClient();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: "", displayOrder: "0", isActive: true },
  });
  const saveMutation = useMutation({
    mutationFn: (values: CategoryFormValues) => {
      const input = {
        name: values.name,
        displayOrder: Number(values.displayOrder),
        isActive: values.isActive,
      };

      return editingCategory ? updateCategory(editingCategory.id, input) : createCategory(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_CATEGORIES_QUERY_KEY });
      onClose();
    },
  });
  const errorMessage =
    saveMutation.error instanceof ApiClientError
      ? saveMutation.error.message
      : saveMutation.isError
        ? "The category could not be saved."
        : null;

  const startCreate = () => {
    setEditingCategory(null);
    reset({ name: "", displayOrder: "0", isActive: true });
  };

  const startEdit = (category: Category) => {
    setEditingCategory(category);
    reset({
      name: category.name,
      displayOrder: String(category.displayOrder),
      isActive: category.isActive,
    });
  };

  return (
    <Dialog open onClose={saveMutation.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Manage categories</DialogTitle>
      <DialogContent dividers>
        {categories.length > 0 && (
          <>
            <Typography variant="subtitle2">Existing categories</Typography>
            <List dense disablePadding sx={{ mb: 2 }}>
              {categories.map((category) => (
                <ListItem
                  key={category.id}
                  disableGutters
                  secondaryAction={
                    <Button onClick={() => startEdit(category)}>Edit {category.name}</Button>
                  }
                >
                  <ListItemText
                    primary={category.name}
                    secondary={`${category.isActive ? "Active" : "Inactive"} · order ${category.displayOrder}`}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}
        <Stack
          id="category-form"
          component="form"
          spacing={2}
          onSubmit={(event) => void handleSubmit((values) => saveMutation.mutate(values))(event)}
        >
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="h6">
              {editingCategory ? `Edit ${editingCategory.name}` : "Create category"}
            </Typography>
            {editingCategory && <Button onClick={startCreate}>Create new instead</Button>}
          </Stack>
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
        <Button onClick={onClose} disabled={saveMutation.isPending}>
          Cancel
        </Button>
        <Button
          form="category-form"
          type="submit"
          variant="contained"
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending
            ? "Saving…"
            : editingCategory
              ? "Save category"
              : "Create category"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
