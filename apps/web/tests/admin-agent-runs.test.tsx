import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../src/App.js";
import { theme } from "../src/theme.js";

const answeredRun = {
  id: "64b000000000000000000001",
  question: "What is low on stock?",
  outcome: "ANSWERED",
  answer: "Coffee powder — Regular is at 5 [R1].",
  failureReason: null,
  sourceIds: ["K1", "R1"],
  model: "test-model",
  totalDurationMs: 4200,
  inputTokens: 2100,
  outputTokens: 80,
  trace: {
    retrievedKnowledge: [{ id: "low-stock-report-semantics", score: 13 }],
    modelCalls: [
      {
        durationMs: 1500,
        ok: true,
        inputTokens: 900,
        outputTokens: 20,
        requestedTools: ["get_shop_summary"],
      },
      { durationMs: 2500, ok: true, inputTokens: 1200, outputTokens: 60, requestedTools: [] },
    ],
    toolCalls: [{ name: "get_shop_summary", durationMs: 120, ok: true }],
  },
  feedback: { rating: "DOWN", comment: "Missed a sold-out size", ratedAt: "2026-09-10T08:05:00Z" },
  createdAt: "2026-09-10T08:00:00.000Z",
};
const blockedRun = {
  ...answeredRun,
  id: "64b000000000000000000002",
  question: "Cancel order 42",
  outcome: "BLOCKED",
  answer: "I’m a read-only shop assistant.",
  sourceIds: [],
  totalDurationMs: 2000,
  inputTokens: 0,
  outputTokens: 0,
  trace: { retrievedKnowledge: [], modelCalls: [], toolCalls: [] },
  feedback: null,
};

const apiResponse = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data, meta: {}, error: null }), {
    headers: { "Content-Type": "application/json" },
  });

const installFetch = (role: "ADMIN" | "STAFF") => {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith("/api/auth/me")) {
      return Promise.resolve(
        apiResponse({
          user: { id: "507f1f77bcf86cd799439011", name: "User", email: "u@example.com", role },
        }),
      );
    }
    if (url.includes("/api/admin/agent/runs?")) {
      return Promise.resolve(
        apiResponse({
          runs: url.includes("rating=DOWN") ? [answeredRun] : [answeredRun, blockedRun],
        }),
      );
    }
    if (url.includes("/api/admin/orders?")) {
      return Promise.resolve(apiResponse({ orders: [] }));
    }
    return Promise.reject(new Error(`Unexpected request ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const renderRoute = (path: string) =>
  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
      >
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );

describe("admin assistant run log", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("summarises runs and shows the retrieval, tool and model trace", async () => {
    installFetch("ADMIN");
    const visitor = userEvent.setup();
    renderRoute("/admin/assistant-runs");

    expect(await screen.findByRole("heading", { name: "Assistant runs" })).toBeInTheDocument();
    expect(await screen.findByText("What is low on stock?")).toBeInTheDocument();
    const summary = screen.getByLabelText("Summary of the runs shown");
    expect(within(summary).getByText("0 of 1")).toBeInTheDocument();
    // Blocked runs are excluded from answer latency.
    expect(within(summary).getByText("4.2 s")).toBeInTheDocument();
    expect(within(summary).getByText("2,180")).toBeInTheDocument();

    await visitor.click(screen.getByText("What is low on stock?"));
    expect(await screen.findByText("low-stock-report-semantics · keyword 13")).toBeInTheDocument();
    expect(screen.getByText(/Tool get_shop_summary: 0\.1 s/)).toBeInTheDocument();
    expect(screen.getByText(/asked for get_shop_summary/)).toBeInTheDocument();
    expect(screen.getByText("Missed a sold-out size")).toBeInTheDocument();

    await visitor.click(screen.getByText("Cancel order 42"));
    expect(await screen.findByText(/the question guardrail answered directly/)).toBeInTheDocument();
  });

  it("filters by feedback on the server", async () => {
    const fetchMock = installFetch("ADMIN");
    const visitor = userEvent.setup();
    renderRoute("/admin/assistant-runs");

    await screen.findByText("Cancel order 42");
    await visitor.click(screen.getByRole("combobox", { name: "Feedback" }));
    await visitor.click(await screen.findByRole("option", { name: "Not helpful" }));

    await waitFor(() => expect(screen.queryByText("Cancel order 42")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("rating=DOWN"))).toBe(
      true,
    );
  });

  it("redirects staff away without requesting runs", async () => {
    const fetchMock = installFetch("STAFF");
    renderRoute("/admin/assistant-runs");

    expect(await screen.findByRole("heading", { name: "Orders" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Assistant runs" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/agent/runs"))).toBe(
      false,
    );
  });
});
