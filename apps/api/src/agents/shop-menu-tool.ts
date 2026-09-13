import { z } from "zod";

import type { ProductService } from "../services/product-service.js";

const MENU_PRODUCT_LIMIT = 30;
const count = z.number().int().nonnegative();
const menuSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(150),
        description: z
          .string()
          .max(1_000)
          .transform((value) => value.slice(0, 600)),
        isVegetarian: z.boolean(),
        variants: z
          .array(
            z.object({
              name: z.string().min(1).max(80),
              price: count,
              stockQuantity: count,
              isAvailable: z.boolean(),
            }),
          )
          .min(1)
          .max(20),
      }),
    )
    .max(MENU_PRODUCT_LIMIT),
  meta: z.object({ total: count }),
});
const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

const projectShopMenu = (input: unknown, generatedAt: string) => {
  const result = menuSchema.safeParse(input);
  if (!result.success || result.data.meta.total < result.data.items.length) {
    throw new Error("The shop returned an unexpected menu format.");
  }

  return {
    generatedAt,
    totalProducts: result.data.meta.total,
    listIsPartial: result.data.meta.total > result.data.items.length,
    products: result.data.items.map((product) => ({
      name: product.name,
      description: product.description,
      isVegetarian: product.isVegetarian,
      variants: product.variants.map((variant) => ({
        name: variant.name,
        pricePaise: variant.price,
        priceFormatted: rupees.format(variant.price / 100),
        stockQuantity: variant.stockQuantity,
        isAvailable: variant.isAvailable,
      })),
    })),
  };
};

export type ShopMenuSnapshot = ReturnType<typeof projectShopMenu>;

export const createShopMenuTool =
  (
    productService: Pick<ProductService, "listPublic">,
    now: () => Date = () => new Date(),
  ): (() => Promise<ShopMenuSnapshot>) =>
  async () => {
    let menu: unknown;
    try {
      menu = await productService.listPublic({
        page: 1,
        limit: MENU_PRODUCT_LIMIT,
        available: "all",
        sortBy: "name",
        sortOrder: "asc",
      });
    } catch {
      throw new Error("The shop menu could not be read.");
    }

    return projectShopMenu(menu, now().toISOString());
  };
