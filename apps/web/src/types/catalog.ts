export interface Category {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  stockQuantity: number;
  isAvailable: boolean;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  imageUrl: string;
  isVegetarian: boolean;
  variants: ProductVariant[];
  isActive: boolean;
  lowStockThreshold: number;
  createdAt: string;
  updatedAt: string;
}
