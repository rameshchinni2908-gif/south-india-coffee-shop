import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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

const renderRoute = (initialEntry: string) => {
  const queryClient = new QueryClient({
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

const seedCart = () => {
  window.localStorage.setItem("south-india-coffee-shop-cart", JSON.stringify([cartItem]));
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

  it("keeps the cart and shows the API stock error when checkout fails", async () => {
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
              code: "INSUFFICIENT_STOCK",
              message: "Only 1 unit of Filter Coffee is available",
            },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const user = userEvent.setup();
    renderRoute("/cart");

    await user.type(await screen.findByLabelText("Customer name"), "Ramesh Kumar");
    await user.type(screen.getByLabelText("Mobile number"), "9876543210");
    await user.click(screen.getByRole("button", { name: "Place pickup order" }));

    expect(
      await screen.findByText("Only 1 unit of Filter Coffee is available"),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Cart with 1 item")).toBeInTheDocument());
  });
});
