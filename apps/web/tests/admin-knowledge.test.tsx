import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../src/App.js";
import { theme } from "../src/theme.js";

const note = (fields: Record<string, unknown>) => ({
  id: "1",
  slug: "payment-at-shop",
  title: "Payment at the shop",
  content: "Orders use PAY_AT_SHOP. Counter payment methods are not confirmed.",
  keywords: ["payment", "upi"],
  isActive: true,
  embeddingStatus: "CURRENT",
  embeddedAt: "2026-09-20T00:00:00.000Z",
  updatedBy: null,
  updatedAt: "2026-09-20T00:00:00.000Z",
  ...fields,
});

const apiResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data, meta: {}, error: null }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const installFetch = (role: "ADMIN" | "STAFF") => {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, options) => {
    const url = String(input);
    const method = options?.method ?? "GET";
    if (url.endsWith("/api/auth/me")) {
      return Promise.resolve(
        apiResponse({ user: { id: "u1", name: "User", email: "u@example.com", role } }),
      );
    }
    if (url.endsWith("/api/admin/knowledge") && method === "GET") {
      return Promise.resolve(
        apiResponse({
          notes: [
            note({}),
            note({
              id: "2",
              slug: "opening-hours",
              title: "Opening hours",
              embeddingStatus: "STALE",
            }),
          ],
          retrieval: { embeddings: true, vectorSearch: "memory", model: "text-embedding-3-small" },
        }),
      );
    }
    if (url.endsWith("/api/admin/knowledge") && method === "POST") {
      return Promise.resolve(apiResponse({ note: note({ slug: "wifi" }) }, 201));
    }
    if (url.endsWith("/api/admin/knowledge/search")) {
      return Promise.resolve(
        apiResponse({
          search: {
            mode: "hybrid",
            fallbackReason: null,
            embeddingTokens: 6,
            results: [
              {
                slug: "payment-at-shop",
                title: "Payment at the shop",
                fusedScore: 0.0325,
                keyword: { rank: 1, score: 8 },
                vector: { rank: 1, similarity: 0.6123 },
              },
              {
                slug: "opening-hours",
                title: "Opening hours",
                fusedScore: 0.0161,
                keyword: null,
                vector: { rank: 2, similarity: 0.33 },
              },
            ],
          },
        }),
      );
    }
    if (url.endsWith("/api/admin/knowledge/embed")) {
      return Promise.resolve(apiResponse({ embedded: 1, tokens: 90 }));
    }
    if (url.includes("/api/admin/orders?")) return Promise.resolve(apiResponse({ orders: [] }));
    return Promise.reject(new Error(`Unexpected request ${method} ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const renderRoute = (path: string) =>
  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
          })
        }
      >
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
const bodyOf = (fetchMock: ReturnType<typeof installFetch>, path: string) =>
  JSON.parse(
    String(
      fetchMock.mock.calls.find(
        ([input, options]) => String(input).endsWith(path) && options?.body !== undefined,
      )?.[1]?.body,
    ),
  ) as unknown;

describe("admin knowledge base", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists notes with their embedding status and offers to embed stale ones", async () => {
    const fetchMock = installFetch("ADMIN");
    const visitor = userEvent.setup();
    renderRoute("/admin/knowledge");

    expect(await screen.findByRole("heading", { name: "Payment at the shop" })).toBeInTheDocument();
    expect(
      screen.getByText(/Hybrid retrieval: keywords \+ text-embedding-3-small/),
    ).toBeInTheDocument();
    expect(screen.getByText("Embedded")).toBeInTheDocument();
    expect(screen.getByText("Needs re-embedding")).toBeInTheDocument();

    await visitor.click(screen.getByRole("button", { name: "Embed 1 pending" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, options]) =>
            String(input).endsWith("/api/admin/knowledge/embed") && options?.method === "POST",
        ),
      ).toBe(true),
    );
  });

  it("explains which notes a question retrieves and why", async () => {
    const fetchMock = installFetch("ADMIN");
    const visitor = userEvent.setup();
    renderRoute("/admin/knowledge");

    await visitor.type(
      await screen.findByRole("textbox", { name: "Question" }),
      "  Do we take UPI? ",
    );
    await visitor.click(screen.getByRole("button", { name: "Search notes" }));

    const table = await screen.findByRole("table", { name: "Retrieved notes" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]!).getByText("#1 · 8")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("#1 · 0.612")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("32.5")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Hybrid search")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "/api/admin/knowledge/search")).toEqual({
      question: "Do we take UPI?",
    });
  });

  it("creates a note with comma-separated keywords", async () => {
    const fetchMock = installFetch("ADMIN");
    const visitor = userEvent.setup();
    renderRoute("/admin/knowledge");

    await visitor.click(await screen.findByRole("button", { name: "New note" }));
    const dialog = await screen.findByRole("dialog", { name: "New knowledge note" });
    await visitor.type(within(dialog).getByRole("textbox", { name: "Title" }), "Wi-Fi");
    // Paste long text: typing it key by key is slow in jsdom.
    await visitor.click(within(dialog).getByRole("textbox", { name: "Content" }));
    await visitor.paste("The shop has no customer Wi-Fi network at the moment.");
    await visitor.type(
      within(dialog).getByRole("textbox", { name: "Keywords" }),
      "wifi, internet, ",
    );
    await visitor.click(within(dialog).getByRole("button", { name: "Save note" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(bodyOf(fetchMock, "/api/admin/knowledge")).toEqual({
      title: "Wi-Fi",
      content: "The shop has no customer Wi-Fi network at the moment.",
      keywords: ["wifi", "internet"],
      isActive: true,
    });
  });

  it("does not save a note that is too short", async () => {
    const fetchMock = installFetch("ADMIN");
    const visitor = userEvent.setup();
    renderRoute("/admin/knowledge");

    await visitor.click(await screen.findByRole("button", { name: "New note" }));
    const dialog = await screen.findByRole("dialog");
    await visitor.type(within(dialog).getByRole("textbox", { name: "Title" }), "Short");
    await visitor.type(within(dialog).getByRole("textbox", { name: "Content" }), "Too short");
    await visitor.click(within(dialog).getByRole("button", { name: "Save note" }));

    expect(await within(dialog).findByText("Write at least 20 characters")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });

  it("redirects staff away without requesting notes", async () => {
    const fetchMock = installFetch("STAFF");
    renderRoute("/admin/knowledge");

    expect(await screen.findByRole("heading", { name: "Orders" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Knowledge" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/knowledge"))).toBe(
      false,
    );
  });
});
