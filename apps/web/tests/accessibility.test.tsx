import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../src/App.js";
import { theme } from "../src/theme.js";

const category = {
  id: "507f1f77bcf86cd799439020",
  name: "Coffee",
  slug: "coffee",
  displayOrder: 1,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const product = {
  id: "507f1f77bcf86cd799439021",
  name: "Filter Coffee",
  slug: "filter-coffee",
  description: "Traditional South Indian filter coffee with a rich decoction.",
  categoryId: category.id,
  imageUrl: "",
  isVegetarian: true,
  variants: [
    {
      id: "507f1f77bcf86cd799439022",
      name: "Regular",
      sku: "COFFEE-REG",
      price: 4500,
      stockQuantity: 20,
      isAvailable: true,
    },
  ],
  isActive: true,
  lowStockThreshold: 5,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const staffUser = {
  id: "507f1f77bcf86cd799439099",
  name: "Staff User",
  email: "staff@example.com",
  role: "STAFF",
};

const emptySummary = {
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

const apiResponse = (data: unknown, meta: Record<string, number> = {}) =>
  new Response(JSON.stringify({ success: true, data, meta, error: null }), {
    status: 200,
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

const expectNoAutomatedViolations = async (container: HTMLElement) => {
  const results = await axe.run(container, {
    rules: {
      // jsdom has no layout engine, so contrast requires a real-browser audit.
      "color-contrast": { enabled: false },
    },
  });

  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      help: violation.help,
      targets: violation.nodes.flatMap((node) => node.target),
    })),
  ).toEqual([]);
};

describe("automated accessibility checks", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("finds no detectable violations on the customer menu", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = String(input);

        if (url.includes("/api/categories")) {
          return Promise.resolve(apiResponse({ categories: [category] }));
        }

        return Promise.resolve(
          apiResponse({ products: [product] }, { page: 1, limit: 12, total: 1, totalPages: 1 }),
        );
      }),
    );
    const { container } = renderRoute("/");

    await screen.findByRole("heading", { name: "Filter Coffee" });
    await expectNoAutomatedViolations(container);
  });

  it("finds no detectable violations on staff sign in", async () => {
    const { container } = renderRoute("/admin/login");

    await screen.findByRole("heading", { name: "Staff sign in" });
    await expectNoAutomatedViolations(container);
  });

  it("finds no detectable violations on the authenticated dashboard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = String(input);

        if (url.endsWith("/api/auth/me")) {
          return Promise.resolve(apiResponse({ user: staffUser }));
        }

        return Promise.resolve(apiResponse({ summary: emptySummary }));
      }),
    );
    const { container } = renderRoute("/admin/dashboard");

    await screen.findByText("No active products are below their stock threshold.");
    await expectNoAutomatedViolations(container);
  });
});
