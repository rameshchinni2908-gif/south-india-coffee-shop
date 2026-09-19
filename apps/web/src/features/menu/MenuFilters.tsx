import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { Box, Button, MenuItem, Stack, TextField } from "@mui/material";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";

import type { Category } from "../../types/catalog.js";
import type { MenuFilterForm } from "./menu-filter-schema.js";

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
  const { control, getValues, reset } = useForm<MenuFilterForm>({ defaultValues: values });
  const selectedValues = useWatch({ control });

  useEffect(() => {
    reset(values);
  }, [reset, values]);

  const apply = (next: Partial<MenuFilterForm>) => {
    onApply({ ...getValues(), ...next });
  };

  const hasActiveFilters =
    Boolean(values.search) ||
    Boolean(values.category) ||
    values.available !== "all" ||
    values.vegetarian !== "all" ||
    values.sort !== "name-asc";

  return (
    <Box
      component="section"
      aria-label="Menu filters"
      sx={{
        py: { xs: 1, sm: 1.25 },
        borderTop: "1px solid",
        borderBottom: "1px solid",
        borderColor: "rgba(91, 50, 29, 0.14)",
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          overflowX: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
          "& .MuiTextField-root": { flex: "0 0 auto" },
        }}
      >
        <TuneRoundedIcon color="primary" fontSize="small" sx={{ flexShrink: 0 }} />
        <FilterSelect
          label="Category"
          value={selectedValues.category ?? ""}
          disabled={categoriesLoading}
          onChange={(value) => apply({ category: value })}
          options={[
            ["", categoriesLoading ? "Loading..." : "All categories"],
            ...categories.map((category) => [category.slug, category.name] as const),
          ]}
        />
        <FilterSelect
          label="Availability"
          value={selectedValues.available ?? "all"}
          onChange={(value) => apply({ available: value as MenuFilterForm["available"] })}
          options={[
            ["all", "All items"],
            ["true", "Available now"],
            ["false", "Unavailable"],
          ]}
        />
        <FilterSelect
          label="Food preference"
          value={selectedValues.vegetarian ?? "all"}
          onChange={(value) => apply({ vegetarian: value as MenuFilterForm["vegetarian"] })}
          options={[
            ["all", "Everyone"],
            ["true", "Vegetarian"],
            ["false", "Non-vegetarian"],
          ]}
        />
        <FilterSelect
          label="Sort"
          value={selectedValues.sort ?? "name-asc"}
          onChange={(value) => apply({ sort: value as MenuFilterForm["sort"] })}
          options={[
            ["name-asc", "Name A-Z"],
            ["createdAt-desc", "Newest"],
            ["updatedAt-desc", "Recently updated"],
          ]}
        />
        {hasActiveFilters && (
          <Button
            size="small"
            color="inherit"
            onClick={onClear}
            sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
          >
            Clear
          </Button>
        )}
      </Stack>
    </Box>
  );
};

interface FilterSelectProps {
  label: string;
  value: string;
  disabled?: boolean;
  options: readonly (readonly [string, string])[];
  onChange(value: string): void;
}

const FilterSelect = ({ label, value, disabled = false, options, onChange }: FilterSelectProps) => (
  <TextField
    select
    size="small"
    label={label}
    value={value}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value)}
    sx={{ minWidth: { xs: 142, sm: 154 } }}
  >
    {options.map(([optionValue, optionLabel]) => (
      <MenuItem key={optionValue} value={optionValue}>
        {optionLabel}
      </MenuItem>
    ))}
  </TextField>
);
