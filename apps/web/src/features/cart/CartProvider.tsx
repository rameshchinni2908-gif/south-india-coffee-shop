import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { z } from "zod";

import {
  CART_STORAGE_KEY,
  MAX_CART_ITEM_QUANTITY,
  CartContext,
  cartItemSchema,
  type CartContextValue,
  type CartItem,
  type NewCartItem,
} from "./cart-context.js";

type CartAction =
  | { type: "add"; item: NewCartItem }
  | { type: "sync"; item: NewCartItem }
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

    return result.success ? result.data : [];
  } catch {
    return [];
  }
};

const cartReducer = (items: CartItem[], action: CartAction): CartItem[] => {
  switch (action.type) {
    case "add":
    case "sync": {
      if (!cartItemSchema.safeParse({ ...action.item, quantity: 1 }).success) {
        return items;
      }

      const existing = items.find((item) => item.variantId === action.item.variantId);

      if (!existing) {
        return action.type === "add" && action.item.stockQuantity > 0
          ? [...items, { ...action.item, quantity: 1 }]
          : items;
      }

      const quantity =
        action.type === "add" &&
        existing.quantity < Math.min(action.item.stockQuantity, MAX_CART_ITEM_QUANTITY)
          ? existing.quantity + 1
          : existing.quantity;
      const detailsUnchanged = Object.entries(action.item).every(
        ([key, value]) => existing[key as keyof NewCartItem] === value,
      );

      if (detailsUnchanged && quantity === existing.quantity) {
        return items;
      }

      return items.map((item) =>
        item === existing ? { ...item, ...action.item, quantity } : item,
      );
    }
    case "update":
      if (!Number.isSafeInteger(action.quantity) || action.quantity < 0) {
        return items;
      }

      if (action.quantity === 0) {
        return items.filter((item) => item.variantId !== action.variantId);
      }

      return items.map((item) =>
        item.variantId === action.variantId &&
        (action.quantity < item.quantity ||
          action.quantity <= Math.min(item.stockQuantity, MAX_CART_ITEM_QUANTITY))
          ? { ...item, quantity: action.quantity }
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
  const syncItem = useCallback((item: NewCartItem) => dispatch({ type: "sync", item }), []);

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      addItem: (item) => dispatch({ type: "add", item }),
      syncItem,
      updateQuantity: (variantId, quantity) => dispatch({ type: "update", variantId, quantity }),
      removeItem: (variantId) => dispatch({ type: "remove", variantId }),
      clearCart: () => dispatch({ type: "clear" }),
    }),
    [items, syncItem],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
