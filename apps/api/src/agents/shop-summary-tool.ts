import { z } from "zod";

import { ACCESS_TOKEN_COOKIE_NAME } from "../middleware/authenticate-staff.js";
import { ORDER_STATUSES } from "../types/order.js";

const count = z.number().int().nonnegative();
const summarySchema = z.object({
  generatedAt: z.iso.datetime(),
  timezone: z.string().min(1),
  today: z.object({
    totalOrders: count,
    statusCounts: z.record(z.enum(ORDER_STATUSES), count),
    orderCount: count,
    salesTotal: count,
    itemsSold: count,
  }),
  lowStockTotal: count,
  lowStockVariants: z
    .array(
      z.object({
        productName: z.string().max(200),
        variantName: z.string().max(200),
        stockQuantity: count,
        lowStockThreshold: count,
        isAvailable: z.boolean(),
      }),
    )
    .max(10),
});

// Explicit projection: customer details, staff names and internal IDs never enter the tool result.
export const projectShopSummary = (input: unknown) => {
  const result = summarySchema.safeParse(input);
  if (!result.success) throw new Error("The shop returned an unexpected report format.");
  const summary = result.data;
  return {
    generatedAt: summary.generatedAt,
    timezone: summary.timezone,
    ordersCreatedToday: {
      total: summary.today.totalOrders,
      currentStatusCounts: summary.today.statusCounts,
    },
    completedSalesUpdatedToday: {
      orderCount: summary.today.orderCount,
      salesTotalPaise: summary.today.salesTotal,
      salesTotalFormatted: new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(summary.today.salesTotal / 100),
      itemsSold: summary.today.itemsSold,
    },
    lowStock: {
      totalVariants: summary.lowStockTotal,
      listedVariants: summary.lowStockVariants,
      listIsPartial: summary.lowStockTotal > summary.lowStockVariants.length,
    },
  };
};

export type ShopSnapshot = ReturnType<typeof projectShopSummary>;

export const shopApiUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      return (
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === "/" &&
        (url.protocol === "https:" || (local && url.protocol === "http:"))
      );
    } catch {
      return false;
    }
  }, "Use an HTTPS API origin, or HTTP localhost, without a path or credentials.");

interface ShopToolOptions {
  apiUrl: string;
  email: string;
  password: string;
  fetcher?: typeof fetch;
}

export const createShopSummaryTool = ({
  apiUrl,
  email,
  password,
  fetcher = fetch,
}: ShopToolOptions) => {
  const origin = shopApiUrlSchema.parse(apiUrl);
  return async (): Promise<ShopSnapshot> => {
    // Login uses the same authorization as the admin website; the model never receives this cookie.
    const login = await fetcher(new URL("/api/auth/login", origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
    if (!login.ok)
      throw new Error(`Shop login failed (HTTP ${login.status}). Check your staff account.`);
    const cookie = login.headers
      .getSetCookie()
      .find((value) => value.startsWith(`${ACCESS_TOKEN_COOKIE_NAME}=`))
      ?.split(";")[0];
    if (!cookie || !cookie.slice(ACCESS_TOKEN_COOKIE_NAME.length + 1)) {
      throw new Error("Shop login did not return a staff session.");
    }
    const report = await fetcher(new URL("/api/admin/reports/summary", origin), {
      headers: { Cookie: cookie },
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
    if (!report.ok)
      throw new Error(
        `Shop report failed (HTTP ${report.status}). Sign in with an active staff account.`,
      );
    const body: unknown = await report.json().catch(() => {
      throw new Error("The shop returned an unreadable report response.");
    });
    const envelope = z
      .object({ success: z.literal(true), data: z.object({ summary: z.unknown() }) })
      .safeParse(body);
    if (!envelope.success) throw new Error("The shop returned an unexpected report response.");
    return projectShopSummary(envelope.data.data.summary);
  };
};
