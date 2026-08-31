import { CategoryModel } from "../models/category-model.js";
import { ProductModel } from "../models/product-model.js";

export interface CatalogSeedCategory {
  name: string;
  slug: string;
  displayOrder: number;
  isActive: boolean;
}

export interface CatalogSeedVariant {
  name: string;
  sku: string;
  price: number;
  stockQuantity: number;
  isAvailable: boolean;
}

export interface CatalogSeedProduct {
  name: string;
  slug: string;
  description: string;
  categorySlug: string;
  imageUrl: string;
  isVegetarian: boolean;
  variants: CatalogSeedVariant[];
  isActive: boolean;
  lowStockThreshold: number;
}

export interface CatalogSeedStore {
  findOrCreateCategory(category: CatalogSeedCategory): Promise<{ id: string; created: boolean }>;
  createProductIfMissing(product: CatalogSeedProduct, categoryId: string): Promise<boolean>;
}

export interface CatalogSeedResult {
  createdCategories: number;
  existingCategories: number;
  createdProducts: number;
  existingProducts: number;
}

export const DEFAULT_CATEGORIES: readonly CatalogSeedCategory[] = [
  { name: "Coffee", slug: "coffee", displayOrder: 1, isActive: true },
  { name: "Tea", slug: "tea", displayOrder: 2, isActive: true },
  { name: "Breakfast", slug: "breakfast", displayOrder: 3, isActive: true },
  { name: "Snacks", slug: "snacks", displayOrder: 4, isActive: true },
  {
    name: "Packaged Products",
    slug: "packaged-products",
    displayOrder: 5,
    isActive: true,
  },
];

export const SAMPLE_PRODUCTS: readonly CatalogSeedProduct[] = [
  {
    name: "South Indian Filter Coffee",
    slug: "south-indian-filter-coffee",
    description: "Fresh filter coffee prepared with a traditional coffee and chicory blend.",
    categorySlug: "coffee",
    imageUrl: "",
    isVegetarian: true,
    variants: [
      {
        name: "Regular",
        sku: "SAMPLE-COFFEE-REGULAR",
        price: 4500,
        stockQuantity: 50,
        isAvailable: true,
      },
      {
        name: "Large",
        sku: "SAMPLE-COFFEE-LARGE",
        price: 6500,
        stockQuantity: 50,
        isAvailable: true,
      },
    ],
    isActive: false,
    lowStockThreshold: 5,
  },
  {
    name: "Masala Tea",
    slug: "masala-tea",
    description: "Fresh milk tea brewed with warming spices.",
    categorySlug: "tea",
    imageUrl: "",
    isVegetarian: true,
    variants: [
      {
        name: "Regular",
        sku: "SAMPLE-TEA-REGULAR",
        price: 3000,
        stockQuantity: 50,
        isAvailable: true,
      },
      {
        name: "Large",
        sku: "SAMPLE-TEA-LARGE",
        price: 4500,
        stockQuantity: 50,
        isAvailable: true,
      },
    ],
    isActive: false,
    lowStockThreshold: 5,
  },
  {
    name: "Idli Plate",
    slug: "idli-plate",
    description: "Steamed rice cakes served with chutney and sambar.",
    categorySlug: "breakfast",
    imageUrl: "",
    isVegetarian: true,
    variants: [
      {
        name: "2 Pieces",
        sku: "SAMPLE-IDLI-2PC",
        price: 4000,
        stockQuantity: 30,
        isAvailable: true,
      },
    ],
    isActive: false,
    lowStockThreshold: 5,
  },
  {
    name: "Medu Vada",
    slug: "medu-vada",
    description: "Crisp lentil fritters served with chutney and sambar.",
    categorySlug: "snacks",
    imageUrl: "",
    isVegetarian: true,
    variants: [
      {
        name: "2 Pieces",
        sku: "SAMPLE-VADA-2PC",
        price: 4500,
        stockQuantity: 30,
        isAvailable: true,
      },
    ],
    isActive: false,
    lowStockThreshold: 5,
  },
  {
    name: "Filter Coffee Powder",
    slug: "filter-coffee-powder",
    description: "Ground coffee and chicory blend for traditional South Indian filter coffee.",
    categorySlug: "packaged-products",
    imageUrl: "",
    isVegetarian: true,
    variants: [
      {
        name: "250 g",
        sku: "SAMPLE-POWDER-250G",
        price: 18000,
        stockQuantity: 20,
        isAvailable: true,
      },
    ],
    isActive: false,
    lowStockThreshold: 5,
  },
];

const mongooseCatalogSeedStore: CatalogSeedStore = {
  async findOrCreateCategory(category) {
    const result = await CategoryModel.updateOne(
      { slug: category.slug },
      { $setOnInsert: category },
      { upsert: true, setDefaultsOnInsert: true },
    ).exec();
    const storedCategory = await CategoryModel.findOne({ slug: category.slug })
      .select({ _id: 1 })
      .lean()
      .exec();

    if (!storedCategory) {
      throw new Error(`Category seed failed for ${category.slug}`);
    }

    return { id: storedCategory._id.toString(), created: result.upsertedCount === 1 };
  },

  async createProductIfMissing(product, categoryId) {
    const skus = product.variants.map((variant) => variant.sku);
    const result = await ProductModel.updateOne(
      {
        $or: [{ slug: product.slug }, { "variants.sku": { $in: skus } }],
      },
      {
        $setOnInsert: {
          name: product.name,
          slug: product.slug,
          description: product.description,
          categoryId,
          imageUrl: product.imageUrl,
          isVegetarian: product.isVegetarian,
          variants: product.variants,
          isActive: product.isActive,
          isArchived: false,
          lowStockThreshold: product.lowStockThreshold,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    ).exec();

    return result.upsertedCount === 1;
  },
};

export const seedCatalog = async (
  store: CatalogSeedStore = mongooseCatalogSeedStore,
): Promise<CatalogSeedResult> => {
  const categoryIds = new Map<string, string>();
  const result: CatalogSeedResult = {
    createdCategories: 0,
    existingCategories: 0,
    createdProducts: 0,
    existingProducts: 0,
  };

  for (const category of DEFAULT_CATEGORIES) {
    const storedCategory = await store.findOrCreateCategory(category);
    categoryIds.set(category.slug, storedCategory.id);
    result[storedCategory.created ? "createdCategories" : "existingCategories"] += 1;
  }

  for (const product of SAMPLE_PRODUCTS) {
    const categoryId = categoryIds.get(product.categorySlug);

    if (!categoryId) {
      throw new Error(`Missing seeded category ${product.categorySlug}`);
    }

    const created = await store.createProductIfMissing(product, categoryId);
    result[created ? "createdProducts" : "existingProducts"] += 1;
  }

  return result;
};
