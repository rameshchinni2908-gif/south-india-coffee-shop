import { createContext } from "react";
import { z } from "zod";

export const CART_STORAGE_KEY = "south-india-coffee-shop-cart";

export const cartItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  variantId: z.string(),
  variantName: z.string(),
  sku: z.string(),
  unitPrice: z.number().int().min(0),
  stockQuantity: z.number().int().min(0),
  quantity: z.number().int().min(1),
});

export type CartItem = z.infer<typeof cartItemSchema>;
export type NewCartItem = Omit<CartItem, "quantity">;

export interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addItem(item: NewCartItem): void;
  updateQuantity(variantId: string, quantity: number): void;
  removeItem(variantId: string): void;
  clearCart(): void;
}

export const CartContext = createContext<CartContextValue | null>(null);
