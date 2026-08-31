import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../src/App.js";
import { theme } from "../src/theme.js";

const ADMIN_ID = "507f1f77bcf86cd799439011";
const STAFF_ID = "507f1f77bcf86cd799439012";

const currentUser = (role: "ADMIN" | "STAFF") => ({
  id: ADMIN_ID,
  name: role === "ADMIN" ? "Admin User" : "Staff User",
  email: role === "ADMIN" ? "admin@example.com" : "staff@example.com",
  role,
});

const staffAccount = {
  id: STAFF_ID,
  name: "Counter Staff",
  email: "counter@example.com",
  role: "STAFF" as const,
  isActive: true,
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

const installFetch = (
  role: "ADMIN" | "STAFF" = "ADMIN",
  configuration: { listError?: boolean } = {},
) => {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, options) => {
    const url = String(input);
    const method = options?.method ?? "GET";

    if (url.endsWith("/api/auth/me")) {
      return Promise.resolve(apiResponse({ user: currentUser(role) }));
    }
    if (url.endsWith("/api/admin/reports/summary")) {
      return Promise.resolve(apiResponse({ summary: dashboardSummary }));
    }
    if (url.includes("/api/admin/staff-accounts?") && method === "GET") {
      return Promise.resolve(
        configuration.listError
          ? apiError(500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred")
          : apiResponse({ staffAccounts: [staffAccount] }, 200, {
              page: 1,
              limit: 12,
              total: 1,
              totalPages: 1,
            }),
      );
    }
    if (url.endsWith("/api/admin/staff-accounts") && method === "POST") {
      return Promise.resolve(apiResponse({ staffAccount }, 201));
    }
    if (url.endsWith(`/api/admin/staff-accounts/${STAFF_ID}`) && method === "PATCH") {
      return Promise.resolve(apiResponse({ staffAccount: { ...staffAccount, isActive: false } }));
    }

    return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
};

describe("admin staff account management", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows account management only to an ADMIN", async () => {
    installFetch("ADMIN");
    renderRoute("/admin/staff");

    expect(await screen.findByRole("heading", { name: "Staff accounts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Staff" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Counter Staff" })).toBeInTheDocument();
    expect(screen.queryByText(/passwordHash/i)).not.toBeInTheDocument();
  });

  it("redirects a STAFF user away without requesting account data", async () => {
    const fetchMock = installFetch("STAFF");
    renderRoute("/admin/staff");

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Staff" })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("/api/admin/staff-accounts")),
    ).toBe(false);
  });

  it("creates a staff account with a temporary password", async () => {
    const fetchMock = installFetch("ADMIN");
    const visitor = userEvent.setup();
    renderRoute("/admin/staff");

    await visitor.click(await screen.findByRole("button", { name: "Create staff account" }));
    await visitor.type(screen.getByLabelText("Staff name"), "New Counter Staff");
    await visitor.type(screen.getByLabelText("Email address"), "NEW.STAFF@EXAMPLE.COM");
    await visitor.type(screen.getByLabelText("Temporary password"), "SecurePassword123");
    await visitor.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([input, options]) =>
          String(input).endsWith("/api/admin/staff-accounts") && options?.method === "POST",
      );

      expect(createCall).toBeDefined();
      expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
        name: "New Counter Staff",
        email: "new.staff@example.com",
        password: "SecurePassword123",
        role: "STAFF",
        isActive: true,
      });
    });
  });

  it("deactivates another account without replacing its password", async () => {
    const fetchMock = installFetch("ADMIN");
    const visitor = userEvent.setup();
    renderRoute("/admin/staff");

    await visitor.click(await screen.findByRole("button", { name: "Edit account" }));
    await visitor.click(screen.getByRole("checkbox", { name: "Account is active" }));
    await visitor.click(screen.getByRole("button", { name: "Save account" }));

    await waitFor(() => {
      const updateCall = fetchMock.mock.calls.find(
        ([input, options]) =>
          String(input).endsWith(`/api/admin/staff-accounts/${STAFF_ID}`) &&
          options?.method === "PATCH",
      );
      const body = JSON.parse(String(updateCall?.[1]?.body)) as Record<string, unknown>;

      expect(body).toEqual({
        name: "Counter Staff",
        email: "counter@example.com",
        role: "STAFF",
        isActive: false,
      });
      expect(body).not.toHaveProperty("password");
    });
  });

  it("renders a retryable safe error when accounts cannot be loaded", async () => {
    installFetch("ADMIN", { listError: true });
    renderRoute("/admin/staff");

    expect(await screen.findByText("Staff accounts could not be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
