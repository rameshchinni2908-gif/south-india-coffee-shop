import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../src/App.js";
import { theme } from "../src/theme.js";

const PRODUCT_ID = "507f1f77bcf86cd799439021";
const VARIANT_ID = "507f1f77bcf86cd799439022";
const cartItem = {
  productId: PRODUCT_ID,
  productName: "Filter Coffee",
  variantId: VARIANT_ID,
  variantName: "Regular",
  sku: "COFFEE-REG",
  unitPrice: 4500,
  stockQuantity: 20,
  quantity: 1,
};

const renderRoute = (initialEntry: string, client?: QueryClient) => {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

const seedCart = (overrides: Partial<typeof cartItem> = {}) => {
  window.localStorage.setItem(
    "south-india-coffee-shop-cart",
    JSON.stringify([{ ...cartItem, ...overrides }]),
  );
};

const successfulOrderResponse = () =>
  new Response(
    JSON.stringify({
      success: true,
      data: {
        order: {
          id: "507f1f77bcf86cd799439099",
          orderNumber: "SIC-20260821-ABC123",
          customerName: "Ramesh Kumar",
          customerMobile: "9876543210",
          items: [
            {
              productId: PRODUCT_ID,
              variantId: VARIANT_ID,
              productName: "Filter Coffee",
              variantName: "Regular",
              sku: "COFFEE-REG",
              unitPrice: 4500,
              quantity: 1,
              lineTotal: 4500,
            },
          ],
          subtotal: 4500,
          taxAmount: 225,
          totalAmount: 4725,
          paymentMethod: "PAY_AT_SHOP",
          paymentStatus: "PENDING",
          status: "PLACED",
          pickupTime: "2099-08-21T11:00:00.000Z",
          notes: "",
          createdAt: "2026-08-21T10:00:00.000Z",
          updatedAt: "2026-08-21T10:00:00.000Z",
        },
      },
      meta: {},
      error: null,
    }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );

describe("pickup checkout", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty-cart state", async () => {
    renderRoute("/cart");

    expect(await screen.findByRole("heading", { name: "Your cart is empty" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse the menu" })).toHaveAttribute("href", "/");
  });

  it("submits identifiers and quantities, then shows the server-confirmed total", async () => {
    seedCart();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(successfulOrderResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderRoute("/cart");

    await user.type(await screen.findByLabelText("Customer name"), "Ramesh Kumar");
    await user.type(screen.getByLabelText("Mobile number"), "9876543210");
    await user.click(screen.getByRole("button", { name: "Place pickup order" }));

    expect(await screen.findByRole("heading", { name: "Order placed" })).toBeInTheDocument();
    expect(screen.getByText("SIC-20260821-ABC123")).toBeInTheDocument();
    expect(screen.getByText(/₹47\.25/)).toBeInTheDocument();
    expect(screen.getByLabelText("Cart with 0 items")).toBeInTheDocument();

    const requestOptions = fetchMock.mock.calls[0]?.[1];
    const requestBody = JSON.parse(String(requestOptions?.body)) as Record<string, unknown>;

    expect(requestBody.items).toEqual([
      { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 },
    ]);
    expect(requestBody).not.toHaveProperty("subtotal");
    expect(requestBody).not.toHaveProperty("totalAmount");
  });

  it.each(["INSUFFICIENT_STOCK", "PRODUCT_UNAVAILABLE", "VARIANT_UNAVAILABLE"])(
    "keeps the cart and offers menu recovery for %s",
    async (code) => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
      });
      const menuKey = ["products", { available: "all" }];
      queryClient.setQueryData(menuKey, { products: [] });
      seedCart();
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(
            JSON.stringify({
              success: false,
              data: null,
              meta: {},
              error: {
                code,
                message: "Only 1 unit of Filter Coffee is available",
              },
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          ),
        ),
      );
      const user = userEvent.setup();
      renderRoute("/cart", queryClient);

      await user.type(await screen.findByLabelText("Customer name"), "Ramesh Kumar");
      await user.type(screen.getByLabelText("Mobile number"), "9876543210");
      await user.click(screen.getByRole("button", { name: "Place pickup order" }));

      expect(
        await screen.findByText("Only 1 unit of Filter Coffee is available"),
      ).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText("Cart with 1 item")).toBeInTheDocument());
      expect(screen.getByRole("link", { name: "Review menu" })).toHaveAttribute("href", "/");
      expect(queryClient.getQueryState(menuKey)?.isInvalidated).toBe(true);
      expect(
        JSON.parse(window.localStorage.getItem("south-india-coffee-shop-cart") ?? "[]"),
      ).toEqual([cartItem]);
    },
  );

  it("explains reduced stock and blocks submission until the quantity is corrected", async () => {
    seedCart({ quantity: 4, stockQuantity: 2 });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderRoute("/cart");

    await user.type(await screen.findByLabelText("Customer name"), "Ramesh Kumar");
    await user.type(screen.getByLabelText("Mobile number"), "9876543210");
    const submitButton = screen.getByRole("button", { name: "Place pickup order" });
    expect(
      screen.getByText("Only 2 available. Reduce the quantity or remove this item."),
    ).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Increase Filter Coffee Regular quantity" }),
    ).toBeDisabled();

    const form = submitButton.closest("form");
    if (!form) throw new Error("Checkout form missing");
    fireEvent.submit(form);
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());

    const decrease = screen.getByRole("button", {
      name: "Decrease Filter Coffee Regular quantity",
    });
    await user.click(decrease);
    expect(screen.getByLabelText("Cart with 3 items")).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
    await user.click(decrease);
    expect(screen.getByLabelText("Cart with 2 items")).toBeInTheDocument();
    expect(screen.getByText("All 2 available are in your cart.")).toBeInTheDocument();
    expect(submitButton).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps an out-of-stock cart item visible and lets the customer remove it", async () => {
    seedCart({ quantity: 2, stockQuantity: 0 });
    const user = userEvent.setup();
    renderRoute("/cart");

    expect(
      await screen.findByText("Out of stock. Remove this item to continue."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place pickup order" })).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Remove Filter Coffee Regular from cart" }),
    );

    expect(await screen.findByRole("heading", { name: "Your cart is empty" })).toBeInTheDocument();
  });

  it("explains the API quantity limit and lets an old cart recover without losing items", async () => {
    seedCart({ quantity: 21, stockQuantity: 50 });
    const user = userEvent.setup();
    renderRoute("/cart");

    expect(
      await screen.findByText("Limit of 20 per item per order. Reduce the quantity to continue."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place pickup order" })).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Decrease Filter Coffee Regular quantity" }),
    );

    expect(screen.getByLabelText("Cart with 20 items")).toBeInTheDocument();
    expect(screen.getByText("Limit of 20 per item per order.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Increase Filter Coffee Regular quantity" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Place pickup order" })).toBeEnabled();
  });
});
