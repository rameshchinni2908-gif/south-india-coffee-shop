import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
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

const optionSx = {
  minHeight: 40,
  px: { xs: 1.5, sm: 2 },
  textTransform: "none",
  whiteSpace: "nowrap",
  fontWeight: 700,
};

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
    <Paper
      component="section"
      aria-labelledby="menu-filter-heading"
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 2, md: 2.5 },
        border: "1px solid",
        borderColor: "rgba(91, 50, 29, 0.14)",
        boxShadow: "0 18px 50px rgba(74, 37, 20, 0.07)",
        animation: "section-enter 460ms cubic-bezier(.2,.75,.25,1) both",
        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <TuneRoundedIcon color="primary" />
          <Box>
            <Typography
              id="menu-filter-heading"
              component="h2"
              variant="h6"
              sx={{ fontWeight: 850 }}
            >
              Browse the menu
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Tap a filter to update the menu instantly.
            </Typography>
          </Box>
        </Stack>
        {hasActiveFilters && (
          <Button
            size="small"
            color="inherit"
            onClick={onClear}
            sx={{ alignSelf: { xs: "flex-start", sm: "auto" } }}
          >
            Clear all
          </Button>
        )}
      </Stack>

      <Stack spacing={2.25} sx={{ mt: 2.5 }}>
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 800, letterSpacing: 0.7 }}
          >
            CATEGORY
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{
              mt: 1,
              mx: { xs: -1.5, sm: 0 },
              px: { xs: 1.5, sm: 0 },
              pb: 0.5,
              flexWrap: { xs: "nowrap", sm: "wrap" },
              overflowX: { xs: "auto", sm: "visible" },
              scrollbarWidth: "none",
              "&::-webkit-scrollbar": { display: "none" },
              "& .MuiChip-root": { flex: "0 0 auto", minHeight: 40 },
            }}
          >
            <Chip
              label="All"
              clickable
              color={selectedValues.category === "" ? "primary" : "default"}
              variant={selectedValues.category === "" ? "filled" : "outlined"}
              onClick={() => apply({ category: "" })}
            />
            {categories.map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                clickable
                color={selectedValues.category === category.slug ? "primary" : "default"}
                variant={selectedValues.category === category.slug ? "filled" : "outlined"}
                onClick={() => apply({ category: category.slug })}
              />
            ))}
            {categoriesLoading && <CircularProgress size={22} aria-label="Loading categories" />}
          </Stack>
        </Box>

        <FilterGroup
          label="AVAILABILITY"
          value={selectedValues.available ?? "all"}
          options={[
            ["all", "All items"],
            ["true", "Available now"],
            ["false", "Unavailable"],
          ]}
          onChange={(value) => apply({ available: value as MenuFilterForm["available"] })}
        />
        <FilterGroup
          label="FOOD PREFERENCE"
          value={selectedValues.vegetarian ?? "all"}
          options={[
            ["all", "Everyone"],
            ["true", "Vegetarian"],
            ["false", "Non-vegetarian"],
          ]}
          onChange={(value) => apply({ vegetarian: value as MenuFilterForm["vegetarian"] })}
        />
        <FilterGroup
          label="SORT MENU"
          value={selectedValues.sort ?? "name-asc"}
          options={[
            ["name-asc", "Name A-Z"],
            ["createdAt-desc", "Newest"],
            ["updatedAt-desc", "Recently updated"],
          ]}
          onChange={(value) => apply({ sort: value as MenuFilterForm["sort"] })}
        />
      </Stack>
    </Paper>
  );
};

interface FilterGroupProps {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange(value: string): void;
}

const FilterGroup = ({ label, value, options, onChange }: FilterGroupProps) => (
  <Box>
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ fontWeight: 800, letterSpacing: 0.7 }}
    >
      {label}
    </Typography>
    <ToggleButtonGroup
      exclusive
      value={value}
      onChange={(_, nextValue: string | null) => {
        if (nextValue !== null) onChange(nextValue);
      }}
      aria-label={label.toLowerCase()}
      sx={{
        mt: 1,
        width: "100%",
        display: "flex",
        overflowX: { xs: "auto", sm: "visible" },
        justifyContent: { sm: "flex-start" },
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
        "& .MuiToggleButton-root": optionSx,
      }}
    >
      {options.map(([optionValue, optionLabel]) => (
        <ToggleButton key={optionValue} value={optionValue}>
          {optionLabel}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  </Box>
);
