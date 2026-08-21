import { z } from "zod";

const integerString = z.string().trim().regex(/^\d+$/, "Enter a whole number");
const priceString = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Use rupees with no more than 2 decimal places");

const variantSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Enter a variant name").max(80),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Enter a SKU")
    .max(80)
    .regex(/^[A-Z0-9_-]+$/, "Use letters, numbers, underscores, or hyphens"),
  priceRupees: priceString,
  stockQuantity: integerString,
  isAvailable: z.boolean(),
});

export const productFormSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a product name").max(150),
    description: z.string().trim().min(1, "Enter a description").max(1_000),
    categoryId: z.string().min(1, "Select a category"),
    imageUrl: z.union([z.string().trim().url("Enter a valid URL"), z.literal("")]),
    isVegetarian: z.boolean(),
    isActive: z.boolean(),
    lowStockThreshold: integerString,
    variants: z.array(variantSchema).min(1, "Add at least one variant").max(20),
  })
  .refine(
    (product) =>
      new Set(product.variants.map((variant) => variant.sku)).size === product.variants.length,
    { message: "Variant SKUs must be unique", path: ["variants"] },
  );

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const availabilityFormSchema = z.object({
  variants: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      stockQuantity: integerString,
      isAvailable: z.boolean(),
    }),
  ),
});

export type AvailabilityFormValues = z.infer<typeof availabilityFormSchema>;

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a category name").max(100),
  displayOrder: integerString,
  isActive: z.boolean(),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
