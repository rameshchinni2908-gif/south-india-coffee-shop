import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { Box, Button, Chip, CircularProgress, MenuItem, Stack, TextField } from "@mui/material";
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
        py: { xs: 1.5, sm: 2 },
        borderTop: "1px solid",
        borderBottom: "1px solid",
        borderColor: "rgba(91, 50, 29, 0.14)",
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        sx={{ alignItems: { md: "center" } }}
      >
        <Stack direction="row" spacing={1} sx={{ minWidth: { md: 118 }, alignItems: "center" }}>
          <TuneRoundedIcon color="primary" fontSize="small" />
          <Box component="span" sx={{ color: "text.secondary", fontSize: 13, fontWeight: 750 }}>
            Filter menu
          </Box>
        </Stack>

        <Stack
          direction="row"
          spacing={0.75}
          useFlexGap
          sx={{
            minWidth: 0,
            flex: 1,
            flexWrap: { xs: "nowrap", md: "wrap" },
            overflowX: { xs: "auto", md: "visible" },
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
            "& .MuiChip-root": { flex: "0 0 auto" },
          }}
        >
          <Chip
            label="All categories"
            clickable
            size="small"
            color={selectedValues.category === "" ? "primary" : "default"}
            variant={selectedValues.category === "" ? "filled" : "outlined"}
            onClick={() => apply({ category: "" })}
          />
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              clickable
              size="small"
              color={selectedValues.category === category.slug ? "primary" : "default"}
              variant={selectedValues.category === category.slug ? "filled" : "outlined"}
              onClick={() => apply({ category: category.slug })}
            />
          ))}
          {categoriesLoading && <CircularProgress size={19} aria-label="Loading categories" />}
        </Stack>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ width: { xs: "100%", md: "auto" }, flexShrink: 0 }}
        >
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
        </Stack>

        {hasActiveFilters && (
          <Button size="small" color="inherit" onClick={onClear} sx={{ flexShrink: 0 }}>
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
  options: readonly (readonly [string, string])[];
  onChange(value: string): void;
}

const FilterSelect = ({ label, value, options, onChange }: FilterSelectProps) => (
  <TextField
    select
    size="small"
    label={label}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    sx={{ minWidth: { xs: "100%", sm: 148 } }}
  >
    {options.map(([optionValue, optionLabel]) => (
      <MenuItem key={optionValue} value={optionValue}>
        {optionLabel}
      </MenuItem>
    ))}
  </TextField>
);
