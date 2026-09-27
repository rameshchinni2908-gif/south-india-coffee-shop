import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../src/App.js";
import { theme } from "../src/theme.js";

const RUN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const item = (fields: Record<string, unknown>) => ({
  productId: "coffee",
  variantId: "coffee-regular",
  productName: "Filter Coffee",
  variantName: "Regular",
  stockQuantity: 10,
  suggestedPrep: 22,
  suggestedQuantity: 12,
  isAvailable: true,
  reason: "Stock 10 is below the usual 22.",
  ...fields,
});
const awaiting = {
  runId: RUN_ID,
  status: "AWAITING_APPROVAL",
  date: "2026-09-28",
  summary: "Two sizes need restocking.",
  items: [
    item({}),
    item({
      productId: "vada",
      variantId: "vada-plate",
      productName: "Medu Vada",
      variantName: "Plate",
      stockQuantity: 2,
      suggestedPrep: 6,
      suggestedQuantity: 4,
      isAvailable: false,
      reason: null,
    }),
  ],
  results: [],
};
const completed = {
  ...awaiting,
  status: "COMPLETED",
  results: [
    {
      variantId: "coffee-regular",
      productName: "Filter Coffee",
      variantName: "Regular",
      quantity: 15,
      status: "APPLIED",
      message: null,
    },
    {
      variantId: "vada-plate",
      productName: "Medu Vada",
      variantName: "Plate",
      quantity: 0,
      status: "SKIPPED",
      message: null,
    },
  ],
};

const apiResponse = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data, meta: {}, error: null }), {
    headers: { "Content-Type": "application/json" },
  });

const installFetch = (role: "ADMIN" | "STAFF", enabled = true) => {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, options) => {
    const url = String(input);
    const method = options?.method ?? "GET";
    if (url.endsWith("/api/auth/me")) {
      return Promise.resolve(
        apiResponse({ user: { id: "u1", name: "User", email: "u@example.com", role } }),
      );
    }
    if (url.endsWith("/api/admin/restock-planner/status")) {
      return Promise.resolve(apiResponse({ planner: { enabled } }));
    }
    if (url.endsWith("/api/admin/restock-planner/runs") && method === "POST") {
      return Promise.resolve(apiResponse({ plan: awaiting }));
    }
    if (url.endsWith(`/runs/${RUN_ID}`)) return Promise.resolve(apiResponse({ plan: awaiting }));
    if (url.endsWith(`/runs/${RUN_ID}/decision`)) {
      return Promise.resolve(apiResponse({ plan: completed }));
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

describe("admin restock planner", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("drafts a plan, lets the admin edit it, and applies the approved items", async () => {
    const fetchMock = installFetch("ADMIN");
    const visitor = userEvent.setup();
    renderRoute("/admin/restock-planner");

    await visitor.click(await screen.findByRole("button", { name: "Draft today's restock plan" }));

    const table = await screen.findByRole("table", { name: "Restock plan" });
    expect(screen.getByText("Two sizes need restocking.")).toBeInTheDocument();
    expect(within(table).getByText("Stock 10 is below the usual 22.")).toBeInTheDocument();
    expect(within(table).getByText("Switched off")).toBeInTheDocument();

    const coffeeQuantity = within(table).getByRole("spinbutton", {
      name: "Units to add for Filter Coffee (Regular)",
    });
    await visitor.clear(coffeeQuantity);
    await visitor.type(coffeeQuantity, "15");
    await visitor.click(within(table).getByRole("checkbox", { name: "Approve Medu Vada (Plate)" }));
    await visitor.click(screen.getByRole("button", { name: "Apply 1 approved item" }));

    expect(await screen.findByText("Applied")).toBeInTheDocument();
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    const decision = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/decision"));
    expect(JSON.parse(String(decision?.[1]?.body))).toEqual({
      decisions: [
        { variantId: "coffee-regular", quantity: 15 },
        { variantId: "vada-plate", quantity: 0 },
      ],
    });
  });

  it("picks up a paused plan from the link after a reload", async () => {
    const fetchMock = installFetch("ADMIN");
    renderRoute(`/admin/restock-planner?run=${RUN_ID}`);

    expect(await screen.findByRole("table", { name: "Restock plan" })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input, options]) =>
          String(input).endsWith("/api/admin/restock-planner/runs") && options?.method === "POST",
      ),
    ).toBe(false);
  });

  it("explains when the planner is not enabled", async () => {
    installFetch("ADMIN", false);
    renderRoute("/admin/restock-planner");

    expect(await screen.findByText(/restock planner is not enabled/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Draft/ })).not.toBeInTheDocument();
  });

  it("redirects staff away without requesting the planner", async () => {
    const fetchMock = installFetch("STAFF");
    renderRoute("/admin/restock-planner");

    expect(await screen.findByRole("heading", { name: "Orders" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Restock planner" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("restock-planner"))).toBe(
      false,
    );
  });
});
