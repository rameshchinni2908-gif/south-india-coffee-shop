import { z } from "zod";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(170)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const queryBooleanSchema = z.enum(["true", "false"]).transform((value) => value === "true");
const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const idParamsSchema = z.object({ id: objectIdSchema }).strict();
export const slugParamsSchema = z.object({ slug: slugSchema }).strict();

export const publicProductQuerySchema = z
  .object({
    ...paginationFields,
    search: z.string().trim().min(1).max(100).optional(),
    category: slugSchema.optional(),
    available: queryBooleanSchema.optional(),
    vegetarian: queryBooleanSchema.optional(),
    sortBy: z.enum(["name", "createdAt", "updatedAt"]).default("name"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();

export const adminProductQuerySchema = z
  .object({
    ...paginationFields,
    search: z.string().trim().min(1).max(100).optional(),
    categoryId: objectIdSchema.optional(),
    available: queryBooleanSchema.optional(),
    vegetarian: queryBooleanSchema.optional(),
    active: queryBooleanSchema.optional(),
    archived: queryBooleanSchema.optional(),
    sortBy: z.enum(["name", "createdAt", "updatedAt"]).default("updatedAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export const adminCategoryQuerySchema = z
  .object({
    ...paginationFields,
    search: z.string().trim().min(1).max(100).optional(),
    active: queryBooleanSchema.optional(),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();

export const createCategoryBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: slugSchema.optional(),
    displayOrder: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
  })
  .strict();

export const updateCategoryBodySchema = createCategoryBodySchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, "At least one field is required");

const productVariantBodySchema = z
  .object({
    id: objectIdSchema.optional(),
    name: z.string().trim().min(1).max(80),
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .min(1)
      .max(80)
      .regex(/^[A-Z0-9_-]+$/),
    price: z.number().int().min(0),
    stockQuantity: z.number().int().min(0),
    isAvailable: z.boolean(),
  })
  .strict();

const variantsAreUnique = (variants: Array<{ sku: string }>): boolean =>
  new Set(variants.map((variant) => variant.sku)).size === variants.length;

export const createProductBodySchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    slug: slugSchema.optional(),
    description: z.string().trim().min(1).max(1_000),
    categoryId: objectIdSchema,
    imageUrl: z.union([z.string().url().max(2_048), z.literal("")]).default(""),
    isVegetarian: z.boolean().default(true),
    variants: z
      .array(productVariantBodySchema.omit({ id: true }))
      .min(1)
      .max(20),
    isActive: z.boolean().default(true),
    lowStockThreshold: z.number().int().min(0).default(5),
  })
  .strict()
  .refine((data) => variantsAreUnique(data.variants), {
    message: "Variant SKUs must be unique",
    path: ["variants"],
  });

export const updateProductBodySchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().min(1).max(1_000).optional(),
    categoryId: objectIdSchema.optional(),
    imageUrl: z.union([z.string().url().max(2_048), z.literal("")]).optional(),
    isVegetarian: z.boolean().optional(),
    variants: z.array(productVariantBodySchema).min(1).max(20).optional(),
    isActive: z.boolean().optional(),
    lowStockThreshold: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "At least one field is required")
  .refine((data) => !data.variants || variantsAreUnique(data.variants), {
    message: "Variant SKUs must be unique",
    path: ["variants"],
  });

const availabilityVariantSchema = z
  .object({
    id: objectIdSchema,
    stockQuantity: z.number().int().min(0).optional(),
    isAvailable: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => data.stockQuantity !== undefined || data.isAvailable !== undefined,
    "Stock quantity or availability is required",
  );

export const updateAvailabilityBodySchema = z
  .object({
    variants: z.array(availabilityVariantSchema).min(1).max(20),
  })
  .strict()
  .refine(
    (data) => new Set(data.variants.map((variant) => variant.id)).size === data.variants.length,
    { message: "Variant IDs must be unique", path: ["variants"] },
  );

export type PublicProductQuery = z.infer<typeof publicProductQuerySchema>;
export type AdminProductQuery = z.infer<typeof adminProductQuerySchema>;
export type AdminCategoryQuery = z.infer<typeof adminCategoryQuerySchema>;
export type CreateCategoryInput = z.infer<typeof createCategoryBodySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategoryBodySchema>;
export type CreateProductInput = z.infer<typeof createProductBodySchema>;
export type UpdateProductInput = z.infer<typeof updateProductBodySchema>;
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilityBodySchema>;
