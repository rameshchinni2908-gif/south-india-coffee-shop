import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../src/App.js";
import { theme } from "../src/theme.js";

const ORDER_ID = "507f1f77bcf86cd799439030";
const order = {
  id: ORDER_ID,
  orderNumber: "SIC-20260821-0001",
  customerName: "Ramesh",
  customerMobile: "9876543210",
  items: [
    {
      productId: "507f1f77bcf86cd799439020",
      variantId: "507f1f77bcf86cd799439021",
      productName: "Filter Coffee",
      variantName: "Regular",
      sku: "COFFEE-REG",
      unitPrice: 4500,
      quantity: 2,
      lineTotal: 9000,
    },
  ],
  subtotal: 9000,
  taxAmount: 0,
  totalAmount: 9000,
  paymentMethod: "PAY_AT_SHOP",
  paymentStatus: "PENDING",
  status: "PLACED",
  pickupTime: "2026-08-21T13:00:00.000Z",
  notes: "Less sugar",
  createdAt: "2026-08-21T12:00:00.000Z",
  updatedAt: "2026-08-21T12:00:00.000Z",
} as const;

const staffUser = {
  id: "507f1f77bcf86cd799439099",
  name: "Staff User",
  email: "staff@example.com",
  role: "STAFF",
};

const apiResponse = (data: unknown, status = 200, meta: Record<string, number> = {}) =>
  new Response(JSON.stringify({ success: status < 400, data, meta, error: null }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const apiError = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ success: false, data: null, meta: {}, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

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

describe("customer order tracking", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("tracks an order with its number and mobile number", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(apiResponse({ order }));
    vi.stubGlobal("fetch", fetchMock);
    const visitor = userEvent.setup();
    renderRoute("/track-order");

    await visitor.type(await screen.findByLabelText("Order number"), "sic-20260821-0001");
    await visitor.type(screen.getByLabelText("Mobile number"), "9876543210");
    await visitor.click(screen.getByRole("button", { name: "Track order" }));

    expect(await screen.findByRole("heading", { name: order.orderNumber })).toBeInTheDocument();
    expect(screen.getAllByText("Placed")).not.toHaveLength(0);
    expect(screen.getByText("₹90")).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      orderNumber: order.orderNumber,
      customerMobile: order.customerMobile,
    });
  });

  it("shows the safe API error when tracking details do not match", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(apiError(404, "ORDER_NOT_FOUND", "No matching order was found")),
    );
    const visitor = userEvent.setup();
    renderRoute("/track-order");

    await visitor.type(await screen.findByLabelText("Order number"), order.orderNumber);
    await visitor.type(screen.getByLabelText("Mobile number"), "9876543210");
    await visitor.click(screen.getByRole("button", { name: "Track order" }));

    expect(await screen.findByText("No matching order was found")).toBeInTheDocument();
  });
});

describe("admin order management", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows only valid next actions and confirms an order", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, options) => {
      const url = String(input);
      const method = options?.method ?? "GET";

      if (url.endsWith("/api/auth/me")) {
        return Promise.resolve(apiResponse({ user: staffUser }));
      }
      if (url.includes("/api/admin/orders?") && method === "GET") {
        return Promise.resolve(
          apiResponse({ orders: [order] }, 200, {
            page: 1,
            limit: 20,
            total: 1,
            totalPages: 1,
          }),
        );
      }
      if (url.endsWith(`/api/admin/orders/${ORDER_ID}/status`) && method === "PATCH") {
        return Promise.resolve(
          apiResponse({ order: { ...order, status: "CONFIRMED", updatedAt: order.updatedAt } }),
        );
      }

      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const visitor = userEvent.setup();
    renderRoute("/admin/orders");

    expect(await screen.findByRole("heading", { name: order.orderNumber })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm order" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark ready" })).not.toBeInTheDocument();

    await visitor.click(screen.getByRole("button", { name: "Confirm order" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([input, options]) =>
          String(input).endsWith(`/api/admin/orders/${ORDER_ID}/status`) &&
          options?.method === "PATCH",
      );

      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({ status: "CONFIRMED" });
    });
  });

  it("reports an insufficient-stock conflict without advancing the order", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, options) => {
      const url = String(input);
      const method = options?.method ?? "GET";

      if (url.endsWith("/api/auth/me")) {
        return Promise.resolve(apiResponse({ user: staffUser }));
      }
      if (url.includes("/api/admin/orders?") && method === "GET") {
        return Promise.resolve(
          apiResponse({ orders: [order] }, 200, {
            page: 1,
            limit: 20,
            total: 1,
            totalPages: 1,
          }),
        );
      }
      if (url.endsWith(`/api/admin/orders/${ORDER_ID}/status`) && method === "PATCH") {
        return Promise.resolve(
          apiError(409, "INSUFFICIENT_STOCK", "Stock is no longer available for every item"),
        );
      }

      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const visitor = userEvent.setup();
    renderRoute("/admin/orders");

    await visitor.click(await screen.findByRole("button", { name: "Confirm order" }));

    expect(
      await screen.findByText("Stock is no longer available for every item"),
    ).toBeInTheDocument();
  });
});
