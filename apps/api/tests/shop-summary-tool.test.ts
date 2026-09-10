import { describe, expect, it, vi } from "vitest";

import { runAdminBriefAgent } from "../src/agents/admin-brief-agent.js";
import type { Respond } from "../src/agents/openai-responses.js";
import {
  createShopSummaryTool,
  projectShopSummary,
  shopApiUrlSchema,
} from "../src/agents/shop-summary-tool.js";

const rawReport = () => ({
  generatedAt: "2026-09-09T08:00:00.000Z",
  timezone: "Asia/Kolkata",
  today: {
    totalOrders: 3,
    statusCounts: { PLACED: 1, CONFIRMED: 0, PREPARING: 0, READY: 0, COMPLETED: 1, CANCELLED: 1 },
    orderCount: 2,
    salesTotal: 4550,
    itemsSold: 4,
    extraPrivateData: "remove me",
  },
  month: { orderCount: 30, salesTotal: 90000, itemsSold: 80 },
  lowStockTotal: 1,
  lowStockVariants: [
    {
      productId: "private-product-id",
      productName: "Filter coffee",
      productSlug: "filter-coffee",
      variantId: "private-variant-id",
      variantName: "Regular",
      sku: "private-sku",
      stockQuantity: 0,
      lowStockThreshold: 5,
      isAvailable: false,
      extraField: "remove me",
    },
  ],
  recentPriceChanges: [{ changedBy: "private-staff-id", changedByName: "Private staff name" }],
  customerMobile: "private-mobile",
});
const credentials = {
  apiUrl: "https://shop.example",
  email: "staff@example.com",
  password: "test-password",
};
const loginResponse = (
  cookie = "staff_access_token=test-session; Path=/; HttpOnly; Secure; SameSite=None",
) => {
  const headers = new Headers();
  headers.append("Set-Cookie", "irrelevant=value; Path=/");
  headers.append("Set-Cookie", cookie);
  return Response.json(
    { success: true, data: { user: { name: "Private staff name" } } },
    { headers },
  );
};
const reportResponse = () =>
  Response.json({ success: true, data: { summary: rawReport() }, meta: {}, error: null });

describe("shop report projection", () => {
  it("preserves meaningful report semantics and only permits the intended fields", () => {
    const projected = projectShopSummary(rawReport());
    expect(projected).toEqual({
      generatedAt: "2026-09-09T08:00:00.000Z",
      timezone: "Asia/Kolkata",
      ordersCreatedToday: {
        total: 3,
        currentStatusCounts: {
          PLACED: 1,
          CONFIRMED: 0,
          PREPARING: 0,
          READY: 0,
          COMPLETED: 1,
          CANCELLED: 1,
        },
      },
      completedSalesUpdatedToday: {
        orderCount: 2,
        salesTotalPaise: 4550,
        salesTotalFormatted: "₹45.50",
        itemsSold: 4,
      },
      lowStock: {
        totalVariants: 1,
        listIsPartial: false,
        listedVariants: [
          {
            productName: "Filter coffee",
            variantName: "Regular",
            stockQuantity: 0,
            lowStockThreshold: 5,
            isAvailable: false,
          },
        ],
      },
    });
    const serialized = JSON.stringify(projected);
    for (const excluded of [
      "private-",
      "Private staff",
      "recentPriceChanges",
      "extraPrivateData",
      "extraField",
      "customerMobile",
      "productSlug",
      "month",
    ]) {
      expect(serialized).not.toContain(excluded);
    }
  });

  it("formats zero paise correctly and represents an empty stock list", () => {
    const report = rawReport();
    report.today = {
      ...report.today,
      totalOrders: 0,
      orderCount: 0,
      salesTotal: 0,
      itemsSold: 0,
      statusCounts: { PLACED: 0, CONFIRMED: 0, PREPARING: 0, READY: 0, COMPLETED: 0, CANCELLED: 0 },
    };
    report.lowStockTotal = 0;
    report.lowStockVariants = [];
    const projected = projectShopSummary(report);
    expect(projected.completedSalesUpdatedToday.salesTotalFormatted).toBe("₹0.00");
    expect(projected.lowStock).toEqual({
      totalVariants: 0,
      listedVariants: [],
      listIsPartial: false,
    });
  });

  it("marks the ten displayed variants as a partial list when the report total is larger", () => {
    const report = rawReport();
    report.lowStockVariants = Array.from({ length: 10 }, (_, index) => ({
      ...report.lowStockVariants[0]!,
      variantName: `Size ${index + 1}`,
    }));
    report.lowStockTotal = 15;
    const projected = projectShopSummary(report);
    expect(projected.lowStock.listIsPartial).toBe(true);
    expect(projected.lowStock.totalVariants).toBe(15);
    expect(projected.lowStock.listedVariants).toHaveLength(10);
  });

  it.each([
    { ...rawReport(), today: { ...rawReport().today, salesTotal: -1 } },
    { ...rawReport(), today: { ...rawReport().today, salesTotal: "4550" } },
    {
      ...rawReport(),
      lowStockVariants: Array.from({ length: 11 }, () => rawReport().lowStockVariants[0]),
    },
    { ...rawReport(), generatedAt: "not a date" },
  ])("rejects malformed report data without echoing its content", (report) => {
    expect(() => projectShopSummary(report)).toThrow(
      "The shop returned an unexpected report format.",
    );
  });
});

describe("authenticated shop tool", () => {
  it("uses normal login then only the fixed report GET and sends the session solely to the shop", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(reportResponse());
    const tool = createShopSummaryTool({ ...credentials, fetcher });
    const projected = await tool();
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [loginUrl, loginOptions] = fetcher.mock.calls[0]!;
    const [reportUrl, reportOptions] = fetcher.mock.calls[1]!;
    expect(String(loginUrl)).toBe("https://shop.example/api/auth/login");
    expect(loginOptions).toMatchObject({ method: "POST", redirect: "error" });
    expect(JSON.parse(String(loginOptions?.body))).toEqual({
      email: credentials.email,
      password: credentials.password,
    });
    expect(String(reportUrl)).toBe("https://shop.example/api/admin/reports/summary");
    expect(reportOptions?.method ?? "GET").toBe("GET");
    expect(reportOptions).toMatchObject({
      redirect: "error",
      headers: { Cookie: "staff_access_token=test-session" },
    });
    expect(reportOptions?.body).toBeUndefined();
    expect(JSON.stringify(projected)).not.toMatch(
      /test-password|staff@example|test-session|Private staff/,
    );
  });

  it.each([401, 429])(
    "stops on login HTTP %s without returning server body details",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response("private login details", { status }));
      await expect(createShopSummaryTool({ ...credentials, fetcher })()).rejects.toThrow(
        `Shop login failed (HTTP ${status}). Check your staff account.`,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["another_cookie=unrelated", "staff_access_token=; Path=/"])(
    "rejects a missing or empty staff session",
    async (cookie) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(loginResponse(cookie));
      await expect(createShopSummaryTool({ ...credentials, fetcher })()).rejects.toThrow(
        "did not return a staff session",
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("does not pass credentials or a failed authenticated report into the next model request", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(new Response("private report details", { status: 401 }));
    const respond = vi.fn<Respond>().mockResolvedValueOnce({
      status: "completed",
      output: [
        {
          type: "function_call",
          name: "get_shop_summary",
          arguments: "{}",
          call_id: "summary_1",
        },
      ],
    });
    const trace = vi.fn<(message: string) => void>();
    await expect(
      runAdminBriefAgent("What needs attention?", {
        respond,
        trace,
        getShopSummary: createShopSummaryTool({ ...credentials, fetcher }),
      }),
    ).rejects.toThrow("Shop report failed (HTTP 401). Sign in with an active staff account.");
    expect(respond).toHaveBeenCalledTimes(1);
    expect(JSON.stringify({ calls: respond.mock.calls, trace: trace.mock.calls })).not.toMatch(
      /test-password|staff@example|test-session|private report/,
    );
  });

  it("rejects a successful HTTP response with an invalid API envelope", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(Response.json({ success: false, data: { summary: rawReport() } }));
    await expect(createShopSummaryTool({ ...credentials, fetcher })()).rejects.toThrow(
      "unexpected report response",
    );
  });

  it("passes redirect rejection through without retrying another destination", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed: redirect forbidden"));
    await expect(createShopSummaryTool({ ...credentials, fetcher })()).rejects.toThrow(
      "redirect forbidden",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe("error");
  });

  it.each([
    "http://shop.example",
    "https://user:pass@shop.example",
    "https://shop.example/api",
    "https://shop.example?redirect=elsewhere",
    "https://shop.example/#fragment",
    "file:///tmp/report",
  ])("rejects unsafe or ambiguous API origin %s before any request", (apiUrl) => {
    const fetcher = vi.fn<typeof fetch>();
    expect(() => createShopSummaryTool({ ...credentials, apiUrl, fetcher })).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost:4000",
    "http://127.0.0.1:4000",
    "http://[::1]:4000",
    "https://shop.example",
  ])("permits supported local and HTTPS origins %s", (apiUrl) => {
    expect(shopApiUrlSchema.safeParse(apiUrl).success).toBe(true);
  });
});
