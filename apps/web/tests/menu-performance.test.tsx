import { ThemeProvider } from "@mui/material/styles";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CartProvider } from "../src/features/cart/CartProvider.js";
import { MenuPage } from "../src/features/menu/MenuPage.js";
import { MenuLoadingState } from "../src/features/menu/MenuStates.js";
import { prefetchMenu } from "../src/features/menu/menu-query-options.js";
import { theme } from "../src/theme.js";

const response = (input: RequestInfo | URL) =>
  new Response(
    JSON.stringify({
      success: true,
      data: String(input).includes("categories") ? { categories: [] } : { products: [] },
      meta: { page: 1, limit: 12, total: 0, totalPages: 0 },
      error: null,
    }),
    { status: 200 },
  );

const createClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: 0 } },
  });

const renderMenu = (client: QueryClient, entry = "/") =>
  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[entry]}>
          <CartProvider>
            <MenuPage />
          </CartProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );

afterEach(() => {
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("menu on slow connections", () => {
  it("starts both requests early and reuses in-flight requests with the same URL filters", async () => {
    const pending: Array<() => void> = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (input) =>
        new Promise((resolve) => {
          pending.push(() => resolve(response(input)));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient();
    const search =
      "?search=filter&category=coffee&available=false&vegetarian=true&sort=updatedAt-desc&page=2";
    prefetchMenu(client, { pathname: "/", search });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    renderMenu(client, `/${search}`);
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
    expect(screen.getByRole("link", { name: "Explore the menu" })).toHaveAttribute(
      "href",
      "#menu-results",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const request = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(Object.fromEntries(request.searchParams)).toMatchObject({
      search: "filter",
      category: "coffee",
      available: "false",
      vegetarian: "true",
      sortBy: "updatedAt",
      sortOrder: "desc",
      page: "2",
      limit: "12",
    });
    await act(async () => {
      pending.forEach((resolve) => resolve());
    });
    expect(await screen.findByRole("heading", { name: "No menu items found" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["/cart", "/admin/login", "/games", "/track-order"])(
    "does not download menu data on %s",
    (pathname) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      prefetchMenu(createClient(), { pathname, search: "" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("explains an offline pause and resumes automatically when connectivity returns", async () => {
    onlineManager.setOnline(false);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((input) => Promise.resolve(response(input)));
    vi.stubGlobal("fetch", fetchMock);
    renderMenu(createClient());
    expect(screen.getByText(/You’re offline/)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByRole("heading", { name: "No menu items found" })).toBeVisible();
    await waitFor(() => expect(screen.queryByText(/You’re offline/)).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("provides patient feedback for a slow API without restarting the request", () => {
    vi.useFakeTimers();
    render(
      <ThemeProvider theme={theme}>
        <MenuLoadingState />
      </ThemeProvider>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(8_000));
    expect(screen.getByRole("status")).toHaveTextContent(/still connecting/);
  });
});
