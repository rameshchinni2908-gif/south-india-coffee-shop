import { useEffect, useMemo, useReducer, type ReactNode } from "react";
import { z } from "zod";

import {
  CART_STORAGE_KEY,
  CartContext,
  cartItemSchema,
  type CartContextValue,
  type CartItem,
  type NewCartItem,
} from "./cart-context.js";

type CartAction =
  | { type: "add"; item: NewCartItem }
  | { type: "update"; variantId: string; quantity: number }
  | { type: "remove"; variantId: string }
  | { type: "clear" };

const readStoredCart = (): CartItem[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedCart = window.localStorage.getItem(CART_STORAGE_KEY);

    if (!storedCart) {
      return [];
    }

    const result = z.array(cartItemSchema).safeParse(JSON.parse(storedCart) as unknown);

    return result.success ? result.data.filter((item) => item.quantity <= item.stockQuantity) : [];
  } catch {
    return [];
  }
};

const cartReducer = (items: CartItem[], action: CartAction): CartItem[] => {
  switch (action.type) {
    case "add": {
      const existing = items.find((item) => item.variantId === action.item.variantId);

      if (!existing) {
        return [...items, { ...action.item, quantity: 1 }];
      }

      return items.map((item) =>
        item.variantId === action.item.variantId
          ? { ...item, quantity: Math.min(item.quantity + 1, action.item.stockQuantity) }
          : item,
      );
    }
    case "update":
      if (action.quantity <= 0) {
        return items.filter((item) => item.variantId !== action.variantId);
      }

      return items.map((item) =>
        item.variantId === action.variantId
          ? { ...item, quantity: Math.min(action.quantity, item.stockQuantity) }
          : item,
      );
    case "remove":
      return items.filter((item) => item.variantId !== action.variantId);
    case "clear":
      return [];
  }
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, dispatch] = useReducer(cartReducer, undefined, readStoredCart);

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      addItem: (item) => dispatch({ type: "add", item }),
      updateQuantity: (variantId, quantity) => dispatch({ type: "update", variantId, quantity }),
      removeItem: (variantId) => dispatch({ type: "remove", variantId }),
      clearCart: () => dispatch({ type: "clear" }),
    }),
    [items],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
