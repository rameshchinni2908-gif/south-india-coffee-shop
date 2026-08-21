import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../src/App.js";
import { formatRupees } from "../src/lib/currency.js";
import { theme } from "../src/theme.js";

const staffUser = {
  id: "507f1f77bcf86cd799439099",
  name: "Staff User",
  email: "staff@example.com",
  role: "STAFF",
};

const summary = {
  generatedAt: "2026-08-21T10:00:00.000Z",
  timezone: "Asia/Kolkata",
  today: {
    totalOrders: 6,
    orderCount: 3,
    salesTotal: 13_500,
    itemsSold: 5,
    statusCounts: {
      PLACED: 2,
      CONFIRMED: 0,
      PREPARING: 0,
      READY: 1,
      COMPLETED: 3,
      CANCELLED: 0,
    },
  },
  month: { orderCount: 42, salesTotal: 189_000, itemsSold: 61 },
  lowStockTotal: 1,
  lowStockVariants: [
    {
      productId: "507f1f77bcf86cd799439020",
      productName: "Filter Coffee",
      productSlug: "filter-coffee",
      variantId: "507f1f77bcf86cd799439021",
      variantName: "Regular",
      sku: "COFFEE-REG",
      stockQuantity: 2,
      lowStockThreshold: 5,
      isAvailable: true,
    },
  ],
  recentPriceChanges: [
    {
      id: "507f1f77bcf86cd799439022",
      productId: "507f1f77bcf86cd799439020",
      productName: "Filter Coffee",
      variantId: "507f1f77bcf86cd799439021",
      variantSku: "COFFEE-REG",
      oldPrice: 4000,
      newPrice: 4500,
      changedBy: "507f1f77bcf86cd799439023",
      changedByName: "Admin User",
      changedAt: "2026-08-21T09:30:00.000Z",
    },
  ],
};

const apiResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status < 400, data, meta: {}, error: null }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const apiError = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ success: false, data: null, meta: {}, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const renderDashboard = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/dashboard"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

describe("admin dashboard", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows sales, order activity, low stock, and recent price history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = String(input);

        if (url.endsWith("/api/auth/me")) {
          return Promise.resolve(apiResponse({ user: staffUser }));
        }
        if (url.endsWith("/api/admin/reports/summary")) {
          return Promise.resolve(apiResponse({ summary }));
        }

        return Promise.reject(new Error(`Unexpected request: ${url}`));
      }),
    );
    renderDashboard();

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(await screen.findByText(formatRupees(13_500))).toBeInTheDocument();
    expect(screen.getByText(formatRupees(189_000))).toBeInTheDocument();
    expect(screen.getAllByText("Filter Coffee")).toHaveLength(2);
    expect(screen.getByText("2 left")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Recent price history" })).toBeInTheDocument();
    expect(screen.getByText("Admin User")).toBeInTheDocument();
  });

  it("renders a retryable error state when the summary request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = String(input);

        if (url.endsWith("/api/auth/me")) {
          return Promise.resolve(apiResponse({ user: staffUser }));
        }

        return Promise.resolve(apiError(500, "REPORT_FAILED", "Report failed"));
      }),
    );
    renderDashboard();

    expect(await screen.findByText("Dashboard data could not be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
