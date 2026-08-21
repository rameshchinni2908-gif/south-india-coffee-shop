import { zodResolver } from "@hookform/resolvers/zod";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import type { Category } from "../../types/catalog.js";
import { menuFilterFormSchema, type MenuFilterForm } from "./menu-filter-schema.js";

interface MenuFiltersProps {
  categories: Category[];
  categoriesLoading: boolean;
  values: MenuFilterForm;
  onApply(values: MenuFilterForm): void;
  onClear(): void;
}

export const MenuFilters = ({
  categories,
  categoriesLoading,
  values,
  onApply,
  onClear,
}: MenuFiltersProps) => {
  const { control, handleSubmit, register, reset, setValue } = useForm<MenuFilterForm>({
    resolver: zodResolver(menuFilterFormSchema),
    defaultValues: values,
  });
  const selectedCategory = useWatch({ control, name: "category", defaultValue: "" });

  useEffect(() => {
    reset(values);
  }, [reset, values]);

  return (
    <Paper
      component="form"
      onSubmit={(event) => void handleSubmit(onApply)(event)}
      elevation={0}
      sx={{
        p: { xs: 2, md: 3 },
        border: "1px solid",
        borderColor: "rgba(91, 50, 29, 0.14)",
        boxShadow: "0 18px 50px rgba(74, 37, 20, 0.07)",
      }}
    >
      <Stack direction="row" spacing={1} sx={{ mb: 2.5, alignItems: "center" }}>
        <TuneRoundedIcon color="primary" />
        <Typography component="h2" variant="h6" sx={{ fontWeight: 850 }}>
          Find your favourite
        </Typography>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(260px, 1.6fr) repeat(3, 1fr)" },
          gap: 1.5,
        }}
      >
        <TextField
          label="Search the menu"
          placeholder="Coffee, dosa, snack…"
          {...register("search")}
          slotProps={{
            htmlInput: { maxLength: 100 },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon aria-hidden="true" />
                </InputAdornment>
              ),
            },
          }}
        />
        <Controller
          control={control}
          name="available"
          render={({ field }) => (
            <TextField select label="Availability" {...field}>
              <MenuItem value="true">Available now</MenuItem>
              <MenuItem value="false">Currently unavailable</MenuItem>
            </TextField>
          )}
        />
        <Controller
          control={control}
          name="vegetarian"
          render={({ field }) => (
            <TextField select label="Food preference" {...field}>
              <MenuItem value="all">All items</MenuItem>
              <MenuItem value="true">Vegetarian</MenuItem>
              <MenuItem value="false">Non-vegetarian</MenuItem>
            </TextField>
          )}
        />
        <Controller
          control={control}
          name="sort"
          render={({ field }) => (
            <TextField select label="Sort by" {...field}>
              <MenuItem value="name-asc">Name A–Z</MenuItem>
              <MenuItem value="createdAt-desc">Newest first</MenuItem>
              <MenuItem value="updatedAt-desc">Recently updated</MenuItem>
            </TextField>
          )}
        />
      </Box>

      <Box sx={{ mt: 2.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 750 }}>
          CATEGORY
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: "wrap" }}>
          <Chip
            label="All"
            clickable
            color={selectedCategory === "" ? "primary" : "default"}
            variant={selectedCategory === "" ? "filled" : "outlined"}
            onClick={() => setValue("category", "", { shouldDirty: true })}
          />
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              clickable
              color={selectedCategory === category.slug ? "primary" : "default"}
              variant={selectedCategory === category.slug ? "filled" : "outlined"}
              onClick={() => setValue("category", category.slug, { shouldDirty: true })}
            />
          ))}
          {categoriesLoading && <CircularProgress size={24} aria-label="Loading categories" />}
        </Stack>
      </Box>

      <Stack direction="row" spacing={1.25} sx={{ mt: 3, justifyContent: "flex-end" }}>
        <Button type="button" color="inherit" onClick={onClear}>
          Clear
        </Button>
        <Button type="submit" variant="contained" startIcon={<SearchRoundedIcon />}>
          Apply filters
        </Button>
      </Stack>
    </Paper>
  );
};
