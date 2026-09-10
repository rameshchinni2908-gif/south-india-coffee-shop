import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CartProvider } from "../src/features/cart/CartProvider.js";
import { CART_STORAGE_KEY, type NewCartItem } from "../src/features/cart/cart-context.js";
import { useCart } from "../src/features/cart/use-cart.js";

const coffee: NewCartItem = {
  productId: "coffee",
  productName: "Filter Coffee",
  variantId: "coffee-regular",
  variantName: "Regular",
  sku: "COFFEE-REG",
  unitPrice: 4500,
  stockQuantity: 5,
};

const renderCart = () => renderHook(() => useCart(), { wrapper: CartProvider });

describe("cart quantities and availability", () => {
  it("does not add out-of-stock items or insert items during a menu refresh", () => {
    const { result } = renderCart();

    act(() => result.current.addItem({ ...coffee, stockQuantity: 0 }));
    act(() => result.current.syncItem(coffee));

    expect(result.current.items).toEqual([]);
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe("[]");
  });

  it("refreshes cart details without reducing a requested quantity or rerendering unchanged data", () => {
    const { result } = renderCart();
    act(() => result.current.addItem(coffee));
    act(() => result.current.updateQuantity(coffee.variantId, 5));

    const updatedCoffee = { ...coffee, stockQuantity: 2, unitPrice: 5000 };
    act(() => result.current.syncItem(updatedCoffee));

    expect(result.current.items).toEqual([{ ...updatedCoffee, quantity: 5 }]);
    expect(result.current.subtotal).toBe(25000);
    const previousItems = result.current.items;
    const previousSync = result.current.syncItem;
    act(() => result.current.syncItem(updatedCoffee));
    expect(result.current.items).toBe(previousItems);
    expect(result.current.syncItem).toBe(previousSync);

    act(() => result.current.updateQuantity(coffee.variantId, 6));
    expect(result.current.items[0]?.quantity).toBe(5);
    act(() => result.current.updateQuantity(coffee.variantId, 4));
    expect(result.current.items[0]?.quantity).toBe(4);
    act(() => result.current.updateQuantity(coffee.variantId, 2));
    expect(result.current.items[0]?.quantity).toBe(2);
    act(() => result.current.updateQuantity(coffee.variantId, 3));
    expect(result.current.items[0]?.quantity).toBe(2);
  });

  it("uses fresh details when adding again and retains quantities if stock falls", () => {
    const { result } = renderCart();
    act(() => result.current.addItem(coffee));
    act(() => result.current.addItem({ ...coffee, unitPrice: 5000 }));
    expect(result.current.items).toEqual([{ ...coffee, unitPrice: 5000, quantity: 2 }]);

    act(() => result.current.addItem({ ...coffee, stockQuantity: 0 }));
    expect(result.current.items).toEqual([{ ...coffee, stockQuantity: 0, quantity: 2 }]);
    act(() => result.current.updateQuantity(coffee.variantId, 1));
    expect(result.current.items[0]?.quantity).toBe(1);
    act(() => result.current.updateQuantity(coffee.variantId, 0));
    expect(result.current.items).toEqual([]);
  });

  it("preserves unavailable items across reloads so the customer can resolve them", () => {
    const { result, unmount } = renderCart();
    act(() => result.current.addItem(coffee));
    act(() => result.current.updateQuantity(coffee.variantId, 3));
    act(() => result.current.syncItem({ ...coffee, stockQuantity: 0 }));
    unmount();

    const reloaded = renderCart();
    expect(reloaded.result.current.items).toEqual([{ ...coffee, stockQuantity: 0, quantity: 3 }]);
    act(() => reloaded.result.current.removeItem(coffee.variantId));
    expect(reloaded.result.current.items).toEqual([]);
  });

  it("caps additions at the API's per-item limit while retaining the actual stock count", () => {
    const { result } = renderCart();
    const abundantCoffee = { ...coffee, stockQuantity: 50 };
    act(() => result.current.addItem(abundantCoffee));
    act(() => result.current.updateQuantity(coffee.variantId, 20));
    act(() => result.current.addItem(abundantCoffee));
    act(() => result.current.updateQuantity(coffee.variantId, 21));

    expect(result.current.items).toEqual([{ ...abundantCoffee, quantity: 20 }]);
  });

  it.each([NaN, Infinity, -Infinity, 1.5, -1])("ignores invalid quantity %s", (quantity) => {
    const { result } = renderCart();
    act(() => result.current.addItem(coffee));
    act(() => result.current.updateQuantity(coffee.variantId, quantity));

    expect(result.current.items).toEqual([{ ...coffee, quantity: 1 }]);
    expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "[]")).toEqual([
      { ...coffee, quantity: 1 },
    ]);
  });
});
