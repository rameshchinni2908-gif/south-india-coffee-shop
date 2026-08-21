import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../src/App.js";
import { theme } from "../src/theme.js";

const CATEGORY_ID = "507f1f77bcf86cd799439020";
const PRODUCT_ID = "507f1f77bcf86cd799439021";
const VARIANT_ID = "507f1f77bcf86cd799439022";

const category = {
  id: CATEGORY_ID,
  name: "Coffee",
  slug: "coffee",
  displayOrder: 1,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const product = {
  id: PRODUCT_ID,
  name: "Filter Coffee",
  slug: "filter-coffee",
  description: "Traditional South Indian filter coffee",
  categoryId: CATEGORY_ID,
  imageUrl: "",
  isVegetarian: true,
  variants: [
    {
      id: VARIANT_ID,
      name: "Regular",
      sku: "COFFEE-REG",
      price: 4500,
      stockQuantity: 20,
      isAvailable: true,
    },
  ],
  isActive: true,
  isArchived: false,
  archivedAt: null,
  archivedBy: null,
  lowStockThreshold: 5,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const dashboardSummary = {
  generatedAt: "2026-08-21T10:00:00.000Z",
  timezone: "Asia/Kolkata",
  today: {
    totalOrders: 0,
    orderCount: 0,
    salesTotal: 0,
    itemsSold: 0,
    statusCounts: {
      PLACED: 0,
      CONFIRMED: 0,
      PREPARING: 0,
      READY: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    },
  },
  month: { orderCount: 0, salesTotal: 0, itemsSold: 0 },
  lowStockTotal: 0,
  lowStockVariants: [],
  recentPriceChanges: [],
};

const user = (role: "ADMIN" | "STAFF") => ({
  id: "507f1f77bcf86cd799439099",
  name: role === "ADMIN" ? "Admin User" : "Staff User",
  email: `${role.toLowerCase()}@example.com`,
  role,
});

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

const installAdminFetch = (role: "ADMIN" | "STAFF" = "ADMIN") => {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, options) => {
    const url = String(input);
    const method = options?.method ?? "GET";

    if (url.endsWith("/api/auth/me")) {
      return Promise.resolve(apiResponse({ user: user(role) }));
    }
    if (url.endsWith("/api/admin/reports/summary")) {
      return Promise.resolve(apiResponse({ summary: dashboardSummary }));
    }
    if (url.includes("/api/admin/categories")) {
      return Promise.resolve(
        apiResponse({ categories: [category] }, 200, {
          page: 1,
          limit: 100,
          total: 1,
          totalPages: 1,
        }),
      );
    }
    if (url.includes(`/api/admin/products/${PRODUCT_ID}/availability`) && method === "PATCH") {
      return Promise.resolve(
        apiResponse({
          product: { ...product, variants: [{ ...product.variants[0], stockQuantity: 9 }] },
        }),
      );
    }
    if (url.endsWith("/api/admin/products") && method === "POST") {
      return Promise.resolve(apiResponse({ product }));
    }
    if (url.includes("/api/admin/products") && method === "GET") {
      return Promise.resolve(
        apiResponse({ products: [product] }, 200, { page: 1, limit: 12, total: 1, totalPages: 1 }),
      );
    }

    return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
};

describe("admin product management", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects an unauthenticated visitor to staff sign in", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(apiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required")),
    );
    renderRoute("/admin/products");

    expect(await screen.findByRole("heading", { name: "Staff sign in" })).toBeInTheDocument();
  });

  it("shows a safe error after invalid login", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(apiError(401, "INVALID_CREDENTIALS", "Invalid email or password")),
    );
    const visitor = userEvent.setup();
    renderRoute("/admin/login");

    await visitor.type(await screen.findByLabelText("Email address"), "staff@example.com");
    await visitor.type(screen.getByLabelText("Password"), "wrong-password");
    await visitor.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
  });

  it("signs in and loads the dashboard", async () => {
    const fetchMock = installAdminFetch("ADMIN");
    fetchMock.mockImplementationOnce(() => Promise.resolve(apiResponse({ user: user("ADMIN") })));
    const visitor = userEvent.setup();
    renderRoute("/admin/login");

    await visitor.type(await screen.findByLabelText("Email address"), "admin@example.com");
    await visitor.type(screen.getByLabelText("Password"), "correct-password");
    await visitor.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open order queue" })).toBeInTheDocument();
  });

  it("does not render the archive action for STAFF", async () => {
    installAdminFetch("STAFF");
    renderRoute("/admin/products");

    expect(await screen.findByRole("heading", { name: "Filter Coffee" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("submits stock and availability through the dedicated endpoint", async () => {
    const fetchMock = installAdminFetch("ADMIN");
    const visitor = userEvent.setup();
    renderRoute("/admin/products");

    await visitor.click(await screen.findByRole("button", { name: "Stock & availability" }));
    const stockInput = await screen.findByLabelText("Stock");
    await visitor.clear(stockInput);
    await visitor.type(stockInput, "9");
    await visitor.click(screen.getByRole("button", { name: "Save stock" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([input, options]) =>
          String(input).endsWith(`/api/admin/products/${PRODUCT_ID}/availability`) &&
          options?.method === "PATCH",
      );

      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
        variants: [{ id: VARIANT_ID, stockQuantity: 9, isAvailable: true }],
      });
    });
  });

  it("creates a product and converts rupees to integer paise", async () => {
    const fetchMock = installAdminFetch("ADMIN");
    const visitor = userEvent.setup();
    renderRoute("/admin/products");

    await visitor.click(await screen.findByRole("button", { name: "Create product" }));

    expect(await screen.findByRole("heading", { name: "Create product" })).toBeInTheDocument();
    await visitor.type(screen.getByLabelText("Product name"), "Masala Tea");
    await visitor.type(screen.getByLabelText("Description"), "Freshly brewed spiced tea");
    await visitor.type(screen.getByLabelText("SKU"), "TEA-REG");
    const priceInput = screen.getByLabelText("Price (₹)");
    await visitor.clear(priceInput);
    await visitor.type(priceInput, "45.50");
    const stockInput = screen.getByLabelText("Stock quantity");
    await visitor.clear(stockInput);
    await visitor.type(stockInput, "10");
    await visitor.click(screen.getByRole("button", { name: "Save product" }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([input, options]) =>
          String(input).endsWith("/api/admin/products") && options?.method === "POST",
      );
      const body = JSON.parse(String(createCall?.[1]?.body)) as {
        name: string;
        variants: Array<{ price: number; stockQuantity: number }>;
      };

      expect(body.name).toBe("Masala Tea");
      expect(body.variants[0]).toMatchObject({ price: 4550, stockQuantity: 10 });
    });
  });
});
