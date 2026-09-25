import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CartProvider } from "../src/features/cart/CartProvider.js";
import { useCart } from "../src/features/cart/use-cart.js";
import { OrderChatAssistant } from "../src/features/menu/OrderChatAssistant.js";
import { theme } from "../src/theme.js";
import type { Product } from "../src/types/catalog.js";

const variant = (id: string, name: string, price: number, stockQuantity = 10) => ({
  id,
  name,
  sku: id.toUpperCase(),
  price,
  stockQuantity,
  isAvailable: true,
});
const products = [
  {
    id: "coffee",
    name: "Filter Coffee",
    slug: "filter-coffee",
    variants: [
      variant("coffee-regular", "Regular", 3_000),
      variant("coffee-large", "Large", 4_500),
    ],
  },
  {
    id: "dosa",
    name: "Masala Dosa",
    slug: "masala-dosa",
    variants: [variant("dosa-r", "Regular", 9_000)],
  },
] as unknown as Product[];

const line = (fields: Record<string, unknown>) => ({
  sizeOptions: [],
  message: null,
  variantName: null,
  ...fields,
});
const draftResponse = (draft: unknown) =>
  new Response(JSON.stringify({ success: true, data: { draft }, meta: {}, error: null }), {
    headers: { "Content-Type": "application/json" },
  });

const CartProbe = () => {
  const { items } = useCart();
  return (
    <output aria-label="Cart contents">
      {items.map((item) => `${item.quantity}x ${item.variantId} @${item.unitPrice}`).join("; ")}
    </output>
  );
};

const renderChat = () =>
  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <MemoryRouter>
          <CartProvider>
            <OrderChatAssistant products={products} />
            <CartProbe />
          </CartProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );

const ask = async (visitor: ReturnType<typeof userEvent.setup>, text: string) => {
  await visitor.type(screen.getByRole("textbox", { name: "What would you like?" }), text);
  await visitor.click(screen.getByRole("button", { name: "Build my order" }));
};

describe("order by message", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("lets the customer review, choose a size and add items with menu prices", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      draftResponse({
        lines: [
          line({
            id: "dosa:",
            productId: "dosa",
            productName: "Masala Dosa",
            variantId: "dosa-r",
            variantName: "Regular",
            quantity: 2,
            status: "READY",
          }),
          line({
            id: "coffee:",
            productId: "coffee",
            productName: "Filter Coffee",
            variantId: null,
            quantity: 1,
            status: "CHOOSE_SIZE",
            sizeOptions: [
              { variantId: "coffee-regular", name: "Regular" },
              { variantId: "coffee-large", name: "Large" },
            ],
            message: "Which size of Filter Coffee?",
          }),
          line({
            id: "tea:",
            productId: "tea",
            productName: "Masala Tea",
            variantId: "tea-r",
            variantName: "Regular",
            quantity: 1,
            status: "SOLD_OUT",
            message: "Masala Tea (Regular) is sold out right now.",
          }),
        ],
        notFound: ["pizza"],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const visitor = userEvent.setup();
    renderChat();

    await ask(visitor, "2 dosas, a coffee, a tea and a pizza");

    expect(await screen.findByRole("heading", { name: "Check your order" })).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ message: "2 dosas, a coffee, a tea and a pizza" }),
    });
    expect(screen.getByRole("checkbox", { name: "2 × Masala Dosa (Regular)" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "1 × Filter Coffee" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "1 × Masala Tea (Regular)" })).toBeDisabled();
    expect(screen.getByText("Not on our menu: pizza")).toBeInTheDocument();
    expect(screen.getByLabelText("Cart contents")).toHaveTextContent("");

    await visitor.click(
      within(screen.getByRole("group", { name: "Size for Filter Coffee" })).getByRole("button", {
        name: "Large",
      }),
    );
    expect(screen.getByRole("checkbox", { name: "1 × Filter Coffee (Large)" })).toBeChecked();
    await visitor.click(screen.getByRole("button", { name: "Add 3 items to cart" }));

    expect(await screen.findByText("Added 3 to your cart.")).toBeInTheDocument();
    // Prices come from the menu data, not from the assistant's response.
    expect(screen.getByLabelText("Cart contents")).toHaveTextContent(
      "2x dosa-r @9000; 1x coffee-large @4500",
    );
    expect(screen.getByRole("link", { name: "View cart" })).toHaveAttribute("href", "/cart");
  });

  it("leaves out lines the customer unticks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        draftResponse({
          lines: [
            line({
              id: "dosa:",
              productId: "dosa",
              productName: "Masala Dosa",
              variantId: "dosa-r",
              variantName: "Regular",
              quantity: 1,
              status: "READY",
            }),
          ],
          notFound: [],
        }),
      ),
    );
    const visitor = userEvent.setup();
    renderChat();

    await ask(visitor, "a dosa");
    await visitor.click(await screen.findByRole("checkbox", { name: "1 × Masala Dosa (Regular)" }));

    expect(screen.getByRole("button", { name: "Choose items to add" })).toBeDisabled();
  });

  it("explains when nothing on the menu matched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(draftResponse({ lines: [], notFound: ["burger"] })),
    );
    const visitor = userEvent.setup();
    renderChat();

    await ask(visitor, "a burger");

    expect(await screen.findByText("We couldn't find burger on our menu.")).toBeInTheDocument();
  });

  it("shows the server's message when the assistant is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            data: null,
            meta: {},
            error: {
              code: "ORDER_ASSISTANT_BUSY",
              message: "Ordering by message is busy today. Please add items from the menu.",
            },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const visitor = userEvent.setup();
    renderChat();

    await ask(visitor, "coffee");

    expect(await screen.findByText(/busy today/)).toBeInTheDocument();
  });
});
