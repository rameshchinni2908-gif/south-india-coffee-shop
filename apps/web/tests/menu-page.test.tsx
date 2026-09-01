import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const successResponse = (data: unknown, meta: Record<string, number> = {}) =>
  new Response(JSON.stringify({ success: true, data, meta, error: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const errorResponse = () =>
  new Response(
    JSON.stringify({
      success: false,
      data: null,
      meta: {},
      error: { code: "DATABASE_UNAVAILABLE", message: "The menu is unavailable" },
    }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );

const renderMenu = (initialEntry = "/") => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
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

const installSuccessfulFetch = (products = [product]) => {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
    const url = String(input);

    if (url.includes("/api/categories")) {
      return Promise.resolve(successResponse({ categories: [category] }));
    }

    return Promise.resolve(
      successResponse(
        { products },
        { page: 1, limit: 12, total: products.length, totalPages: products.length ? 1 : 0 },
      ),
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
};

describe("customer menu", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders API products, category, availability, and INR prices", async () => {
    installSuccessfulFetch();
    renderMenu();

    expect(await screen.findByRole("heading", { name: "Filter Coffee" })).toBeInTheDocument();
    expect(screen.getByText("COFFEE")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getAllByText(/₹45/).length).toBeGreaterThan(0);
    expect(screen.getByText("1 item")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "JRG South India Coffee Shop home" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Coffee category presentation" })).toHaveAttribute(
      "src",
      "/images/categories/coffee.jpg",
    );
  });

  it("makes the menu results focusable for the skip link", async () => {
    installSuccessfulFetch();
    renderMenu();

    await screen.findByRole("heading", { name: "Filter Coffee" });
    expect(screen.getByRole("main")).toHaveAttribute("id", "menu-results");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  });

  it("adds an available product variant to the cart", async () => {
    installSuccessfulFetch();
    const user = userEvent.setup();
    renderMenu();

    await user.click(
      await screen.findByRole("button", { name: "Add Filter Coffee Regular to cart" }),
    );

    expect(screen.getByLabelText("Cart with 1 item")).toBeInTheDocument();
  });

  it("shows a useful empty state", async () => {
    installSuccessfulFetch([]);
    renderMenu();

    expect(await screen.findByRole("heading", { name: "No menu items found" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("shows loading feedback while product data is pending", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    renderMenu();

    expect(screen.getByLabelText("Loading menu")).toBeInTheDocument();
  });

  it("shows a retryable API error state", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockImplementation((input) =>
          Promise.resolve(
            String(input).includes("/api/categories")
              ? successResponse({ categories: [category] })
              : errorResponse(),
          ),
        ),
    );
    renderMenu();

    expect(await screen.findByText(/couldn’t load the menu/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("stores applied search and category filters in the request URL", async () => {
    const fetchMock = installSuccessfulFetch();
    const user = userEvent.setup();
    renderMenu();

    await screen.findByRole("heading", { name: "Filter Coffee" });
    await user.type(screen.getByLabelText("Search the menu"), "filter coffee");
    await user.click(screen.getByRole("button", { name: "Coffee" }));
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => {
          const url = String(input);
          return url.includes("search=filter+coffee") && url.includes("category=coffee");
        }),
      ).toBe(true);
    });
  });

  it("restores availability and vegetarian filters from the URL", async () => {
    const fetchMock = installSuccessfulFetch([]);
    renderMenu("/?available=false&vegetarian=true");

    await screen.findByRole("heading", { name: "No menu items found" });
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = String(input);
        return url.includes("available=false") && url.includes("vegetarian=true");
      }),
    ).toBe(true);
  });
});
