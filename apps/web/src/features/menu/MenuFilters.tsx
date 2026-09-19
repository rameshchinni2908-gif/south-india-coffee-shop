import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { Box, Button, Chip, Menu, MenuItem, Stack } from "@mui/material";
import { useEffect, useState } from "react";
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
        py: { xs: 1.25, sm: 1.5 },
        borderTop: "1px solid",
        borderBottom: "1px solid",
        borderColor: "rgba(91, 50, 29, 0.14)",
      }}
    >
      <Stack
        direction="row"
        spacing={0.75}
        useFlexGap
        sx={{
          alignItems: "center",
          overflowX: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
          "& .MuiChip-root, & .MuiButton-root": { flex: "0 0 auto" },
        }}
      >
        <TuneRoundedIcon color="primary" fontSize="small" sx={{ mx: 0.25, flexShrink: 0 }} />
        <Chip
          label="All"
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
        {categoriesLoading ? <Chip label="Loading" size="small" disabled /> : null}
        <FilterMenuButton
          label="Availability"
          value={selectedValues.available ?? "all"}
          options={[
            ["all", "All items"],
            ["true", "Available now"],
            ["false", "Unavailable"],
          ]}
          onChange={(value) => apply({ available: value as MenuFilterForm["available"] })}
        />
        <FilterMenuButton
          label="Food preference"
          value={selectedValues.vegetarian ?? "all"}
          options={[
            ["all", "Everyone"],
            ["true", "Vegetarian"],
            ["false", "Non-vegetarian"],
          ]}
          onChange={(value) => apply({ vegetarian: value as MenuFilterForm["vegetarian"] })}
        />
        <FilterMenuButton
          label="Sort"
          value={selectedValues.sort ?? "name-asc"}
          options={[
            ["name-asc", "Name A-Z"],
            ["createdAt-desc", "Newest"],
            ["updatedAt-desc", "Recently updated"],
          ]}
          onChange={(value) => apply({ sort: value as MenuFilterForm["sort"] })}
        />
        {hasActiveFilters && (
          <Button size="small" color="inherit" onClick={onClear} sx={{ whiteSpace: "nowrap" }}>
            Clear
          </Button>
        )}
      </Stack>
    </Box>
  );
};

interface FilterMenuButtonProps {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange(value: string): void;
}

const FilterMenuButton = ({ label, value, options, onChange }: FilterMenuButtonProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const selectedOption =
    options.find(([optionValue]) => optionValue === value)?.[1] ?? options[0]?.[1];
  const isActive = value !== options[0]?.[0];

  return (
    <>
      <Button
        size="small"
        variant={isActive ? "contained" : "outlined"}
        color={isActive ? "primary" : "inherit"}
        endIcon={<KeyboardArrowDownRoundedIcon fontSize="small" />}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        sx={{
          minHeight: 32,
          px: 1.25,
          borderRadius: 999,
          textTransform: "none",
          whiteSpace: "nowrap",
          fontWeight: 700,
        }}
      >
        {label}: {selectedOption}
      </Button>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {options.map(([optionValue, optionLabel]) => (
          <MenuItem
            key={optionValue}
            selected={optionValue === value}
            onClick={() => {
              onChange(optionValue);
              setAnchorEl(null);
            }}
          >
            {optionLabel}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
