import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PrepBriefCard } from "../src/features/admin/dashboard/PrepBriefCard.js";
import { theme } from "../src/theme.js";

const item = (fields: Record<string, unknown>) => ({
  productId: "coffee",
  variantId: "coffee-regular",
  productName: "Filter Coffee",
  variantName: "Regular",
  daysCompared: 4,
  averageUnits: 19.5,
  highestUnits: 24,
  suggestedPrep: 22,
  stockQuantity: 10,
  isAvailable: true,
  restockNeeded: 12,
  lowConfidence: false,
  ...fields,
});
const brief = (fields: Record<string, unknown> = {}) => ({
  date: "2026-09-24",
  forecast: {
    date: "2026-09-24",
    weekday: "Thursday",
    weeksLookedBack: 4,
    items: [
      item({}),
      item({
        variantId: "vada-plate",
        productName: "Medu Vada",
        variantName: "Plate",
        averageUnits: 5,
        highestUnits: 5,
        suggestedPrep: 6,
        stockQuantity: 12,
        isAvailable: false,
        restockNeeded: 0,
        lowConfidence: true,
      }),
    ],
  },
  narrative: "Prepare 22 Filter Coffee Regular and restock 12.",
  narrativeStatus: "WRITTEN",
  generatedAt: "2026-09-24T00:30:00.000Z",
  ...fields,
});
const response = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data, meta: {}, error: null }), {
    headers: { "Content-Type": "application/json" },
  });

const renderCard = (canRegenerate: boolean) =>
  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <PrepBriefCard canRegenerate={canRegenerate} />
      </QueryClientProvider>
    </ThemeProvider>,
  );

describe("prep brief card", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the computed plan with the written summary", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response({ brief: brief() })));
    renderCard(false);

    expect(
      await screen.findByRole("heading", { name: "Prep plan for Thursday" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Prepare 22 Filter Coffee Regular and restock 12."),
    ).toBeInTheDocument();
    const rows = within(screen.getByRole("table", { name: "Prep plan for Thursday" })).getAllByRole(
      "row",
    );
    expect(within(rows[1]!).getByText("19.5 (max 24)")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("22")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("12")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Switched off")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Little history")).toBeInTheDocument();
    // Staff can read the plan but not regenerate it.
    expect(
      screen.queryByRole("button", { name: /Update with latest orders/ }),
    ).not.toBeInTheDocument();
  });

  it("explains a rejected summary and keeps the table", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          response({ brief: brief({ narrative: null, narrativeStatus: "REJECTED" }) }),
        ),
    );
    renderCard(false);

    expect(await screen.findByText(/used a number not in the plan/)).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("explains when there is no history yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        response({
          brief: brief({
            forecast: { date: "2026-09-24", weekday: "Thursday", weeksLookedBack: 4, items: [] },
            narrative: null,
            narrativeStatus: "SKIPPED",
          }),
        }),
      ),
    );
    renderCard(true);

    expect(
      await screen.findByText(/Not enough order history for Thursdays yet/),
    ).toBeInTheDocument();
  });

  it("lets an admin update the plan with the latest orders", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ brief: brief() }))
      .mockResolvedValueOnce(
        response({ brief: brief({ narrative: "Prepare 22 Filter Coffee Regular." }) }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const visitor = userEvent.setup();
    renderCard(true);

    await visitor.click(await screen.findByRole("button", { name: "Update with latest orders" }));

    expect(await screen.findByText("Prepare 22 Filter Coffee Regular.")).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/api\/admin\/prep-brief\/today\/regenerate$/);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
  });
});
