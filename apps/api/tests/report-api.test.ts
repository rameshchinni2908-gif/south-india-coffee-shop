import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { HttpError } from "../src/middleware/http-error.js";
import type { AuthService } from "../src/services/auth-service.js";
import type { ReportService } from "../src/services/report-service.js";

const authService: AuthService = {
  login: () => Promise.reject(new HttpError(500, "UNEXPECTED_LOGIN", "Login was not expected")),
  authenticateAccessToken: (token) =>
    token === "staff"
      ? Promise.resolve({
          id: "507f1f77bcf86cd799439023",
          name: "Staff User",
          email: "staff@example.com",
          role: "STAFF",
        })
      : Promise.reject(new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required")),
};

const reportService: ReportService = {
  getSummary: () =>
    Promise.resolve({
      generatedAt: new Date("2026-08-21T10:00:00.000Z"),
      timezone: "Asia/Kolkata",
      today: {
        totalOrders: 6,
        orderCount: 3,
        salesTotal: 13_500,
        itemsSold: 5,
        statusCounts: {
          PLACED: 2,
          CONFIRMED: 0,
          PREPARING: 0,
          READY: 1,
          COMPLETED: 3,
          CANCELLED: 0,
        },
      },
      month: { orderCount: 42, salesTotal: 189_000, itemsSold: 61 },
      lowStockTotal: 0,
      lowStockVariants: [],
      recentPriceChanges: [],
    }),
};

const createReportApp = () =>
  createApp({
    clientUrl: "http://localhost:5173",
    authService,
    reportService,
    isProduction: false,
    databaseState: () => "connected",
    enableRequestLogging: false,
  });

describe("report API", () => {
  it("requires staff authentication", async () => {
    const response = await request(createReportApp()).get("/api/admin/reports/summary");

    expect(response.status).toBe(401);
  });

  it("returns the dashboard summary to authenticated staff", async () => {
    const response = await request(createReportApp())
      .get("/api/admin/reports/summary")
      .set("Cookie", "staff_access_token=staff");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        summary: {
          timezone: "Asia/Kolkata",
          today: { totalOrders: 6, salesTotal: 13_500 },
          month: { salesTotal: 189_000 },
        },
      },
      meta: {},
      error: null,
    });
  });
});
