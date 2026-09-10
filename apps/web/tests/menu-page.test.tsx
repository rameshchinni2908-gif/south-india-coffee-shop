import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../src/App.js";
import { getCategoryArtwork } from "../src/features/menu/category-artwork.js";
import { CartProvider } from "../src/features/cart/CartProvider.js";
import { CART_STORAGE_KEY } from "../src/features/cart/cart-context.js";
import { ProductVariantControl } from "../src/features/menu/ProductVariantControl.js";
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
      screen.getByRole("link", { name: "JRG South Indian Coffee Shop home" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Coffee category presentation" })).toHaveAttribute(
      "src",
      getCategoryArtwork("coffee", "Coffee"),
    );
  });

  it("makes the menu results focusable for the skip link", async () => {
    installSuccessfulFetch();
    renderMenu();

    await screen.findByRole("heading", { name: "Filter Coffee" });
    expect(screen.getByRole("main")).toHaveAttribute("id", "menu-results");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  });

  it("uses responsive category photos after a custom image fails, then a download-free placeholder", async () => {
    installSuccessfulFetch([{ ...product, imageUrl: "https://example.com/coffee.jpg" }]);
    renderMenu();

    const customImage = await screen.findByRole("img", { name: "Filter Coffee" });
    expect(customImage).not.toHaveAttribute("srcset");
    expect(customImage).toHaveAttribute("loading", "lazy");
    expect(customImage).toHaveAttribute("decoding", "async");
    fireEvent.error(customImage);

    const fallbackImage = screen.getByRole("img", { name: "Coffee category presentation" });
    expect(fallbackImage.getAttribute("srcset")).toContain("coffee-480.jpg 480w");
    expect(fallbackImage.getAttribute("srcset")).toContain("coffee-768.jpg 768w");
    fireEvent.error(fallbackImage);

    expect(screen.getByRole("img", { name: "Filter Coffee image placeholder" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Filter Coffee Regular to cart" })).toBeEnabled();
  });

  it("adds an available product variant to the cart", async () => {
    installSuccessfulFetch();
    const user = userEvent.setup();
    renderMenu();

    await user.click(
      await screen.findByRole("button", { name: "Add Filter Coffee Regular to cart" }),
    );

    expect(screen.getByLabelText("Cart with 1 item")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter Coffee Regular quantity in cart")).toHaveTextContent("1");
  });

  it("shows per-item quantities, explains the stock limit, and removes the last unit", async () => {
    installSuccessfulFetch([
      { ...product, variants: [{ ...product.variants[0]!, stockQuantity: 2 }] },
    ]);
    const user = userEvent.setup();
    renderMenu();
    await user.click(
      await screen.findByRole("button", { name: "Add Filter Coffee Regular to cart" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Increase Filter Coffee Regular quantity" }),
    );
    expect(screen.getByLabelText("Filter Coffee Regular quantity in cart")).toHaveTextContent("2");
    expect(screen.getByLabelText("Cart with 2 items")).toBeInTheDocument();
    expect(screen.getByText("All 2 available added")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Increase Filter Coffee Regular quantity" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Decrease Filter Coffee Regular quantity" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Decrease Filter Coffee Regular quantity" }),
    );
    expect(screen.getByRole("button", { name: "Add Filter Coffee Regular to cart" })).toBeEnabled();
    expect(screen.getByLabelText("Cart with 0 items")).toBeInTheDocument();
  });

  it("keeps menu and checkout quantities in sync in both directions", async () => {
    installSuccessfulFetch();
    const user = userEvent.setup();
    renderMenu();
    await user.click(
      await screen.findByRole("button", { name: "Add Filter Coffee Regular to cart" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Increase Filter Coffee Regular quantity" }),
    );
    await user.click(screen.getByRole("link", { name: "Cart with 2 items" }));
    await screen.findByRole("heading", { name: "Your pickup order" });
    await user.click(
      await screen.findByRole("button", { name: "Decrease Filter Coffee Regular quantity" }),
    );
    await user.click(screen.getByRole("link", { name: /Continue browsing/ }));
    expect(
      await screen.findByLabelText("Filter Coffee Regular quantity in cart"),
    ).toHaveTextContent("1");
  });

  it("shows restored cart quantities independently for each size", async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([
        {
          productId: product.id,
          productName: product.name,
          variantId: product.variants[0]!.id,
          variantName: "Regular",
          sku: "COFFEE-REG",
          unitPrice: 4500,
          stockQuantity: 20,
          quantity: 3,
        },
      ]),
    );
    installSuccessfulFetch([
      {
        ...product,
        variants: [
          product.variants[0]!,
          {
            ...product.variants[0]!,
            id: "507f1f77bcf86cd799439023",
            name: "Large",
            sku: "COFFEE-LARGE",
          },
        ],
      },
    ]);
    const user = userEvent.setup();
    renderMenu();
    expect(
      await screen.findByLabelText("Filter Coffee Regular quantity in cart"),
    ).toHaveTextContent("3");
    await user.click(screen.getByRole("button", { name: "Add Filter Coffee Large to cart" }));
    expect(screen.getByLabelText("Filter Coffee Large quantity in cart")).toHaveTextContent("1");
    expect(screen.getByLabelText("Filter Coffee Regular quantity in cart")).toHaveTextContent("3");
    expect(screen.getByLabelText("Cart with 4 items")).toBeInTheDocument();
  });

  it("lists sold-out and unavailable sizes clearly without allowing additions", async () => {
    const fetchMock = installSuccessfulFetch([
      {
        ...product,
        variants: [
          { ...product.variants[0]!, stockQuantity: 0 },
          {
            ...product.variants[0]!,
            id: "507f1f77bcf86cd799439023",
            name: "Large",
            isAvailable: false,
          },
        ],
      },
    ]);
    renderMenu();
    const regular = await screen.findByRole("group", { name: "Filter Coffee Regular" });
    expect(within(regular).getByText("Out of stock")).toBeVisible();
    expect(within(regular).getByRole("button")).toBeDisabled();
    const large = screen.getByRole("group", { name: "Filter Coffee Large" });
    expect(within(large).getByText("Currently unavailable")).toBeVisible();
    expect(within(large).getByRole("button")).toBeDisabled();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("available=all"))).toBe(
      true,
    );
  });

  it("explains stock reductions without hiding the quantity the customer selected", async () => {
    const user = userEvent.setup();
    const renderVariant = (stockQuantity: number) => (
      <ThemeProvider theme={theme}>
        <CartProvider>
          <ProductVariantControl
            product={{ ...product, isArchived: false, archivedAt: null, archivedBy: null }}
            variant={{ ...product.variants[0]!, stockQuantity }}
          />
        </CartProvider>
      </ThemeProvider>
    );
    const view = render(renderVariant(2));
    await user.click(screen.getByRole("button", { name: "Add Filter Coffee Regular to cart" }));
    await user.click(
      screen.getByRole("button", { name: "Increase Filter Coffee Regular quantity" }),
    );
    view.rerender(renderVariant(1));
    expect(screen.getByText("Only 1 available. Reduce your quantity.")).toBeVisible();
    expect(screen.getByLabelText("Filter Coffee Regular quantity in cart")).toHaveTextContent("2");
    expect(
      screen.getByRole("button", { name: "Increase Filter Coffee Regular quantity" }),
    ).toBeDisabled();
    view.rerender(renderVariant(0));
    expect(screen.getByText("Out of stock. Remove from your cart to continue.")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Decrease Filter Coffee Regular quantity" }),
    );
    expect(screen.getByLabelText("Filter Coffee Regular quantity in cart")).toHaveTextContent("1");
    await user.click(
      screen.getByRole("button", { name: "Decrease Filter Coffee Regular quantity" }),
    );
    expect(
      screen.getByRole("button", { name: "Filter Coffee Regular out of stock" }),
    ).toBeDisabled();
  });

  it("explains the per-order limit when stock exceeds it", async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([
        {
          productId: product.id,
          productName: product.name,
          variantId: product.variants[0]!.id,
          variantName: "Regular",
          sku: "COFFEE-REG",
          unitPrice: 4500,
          stockQuantity: 50,
          quantity: 19,
        },
      ]),
    );
    installSuccessfulFetch([
      { ...product, variants: [{ ...product.variants[0]!, stockQuantity: 50 }] },
    ]);
    const user = userEvent.setup();
    renderMenu();
    await user.click(
      await screen.findByRole("button", { name: "Increase Filter Coffee Regular quantity" }),
    );
    expect(screen.getByText("Limit of 20 per order")).toBeVisible();
    expect(screen.getByLabelText("Filter Coffee Regular quantity in cart")).toHaveTextContent("20");
    expect(
      screen.getByRole("button", { name: "Increase Filter Coffee Regular quantity" }),
    ).toBeDisabled();
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
