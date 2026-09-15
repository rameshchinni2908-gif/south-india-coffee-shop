import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createMcpRouter } from "../src/routes/mcp-route.js";

const report = {
  generatedAt: new Date("2026-09-15T05:00:00.000Z"),
  timezone: "Asia/Kolkata",
  today: {
    totalOrders: 0,
    orderCount: 0,
    salesTotal: 0,
    itemsSold: 0,
    statusCounts: { PLACED: 0, CONFIRMED: 0, PREPARING: 0, READY: 0, COMPLETED: 0, CANCELLED: 0 },
  },
  month: { orderCount: 0, salesTotal: 0, itemsSold: 0 },
  lowStockTotal: 0,
  lowStockVariants: [],
  recentPriceChanges: [],
};

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  const productService = {
    listPublic: vi.fn().mockResolvedValue({ items: [], meta: { total: 0 } }),
  };
  const reportService = { getSummary: vi.fn().mockResolvedValue(report) };
  app.use("/mcp", createMcpRouter({ productService, reportService, token: "a".repeat(32) }));
  return { app, productService, reportService };
};

describe("remote MCP route", () => {
  it("requires the bearer token", async () => {
    const { app } = createTestApp();
    await request(app)
      .post("/mcp")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      .expect(401);
  });

  it("lists tools and reads the safe menu projection", async () => {
    const { app, productService } = createTestApp();
    const auth = { Authorization: `Bearer ${"a".repeat(32)}` };
    const listed = await request(app)
      .post("/mcp")
      .set(auth)
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      .expect(200);
    expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "get_shop_menu",
      "get_shop_summary",
    ]);
    await request(app)
      .post("/mcp")
      .set(auth)
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "get_shop_menu", arguments: {} },
      })
      .expect(200);
    expect(productService.listPublic).toHaveBeenCalledOnce();
  });

  it("rejects arguments and unknown tools before reading the database", async () => {
    const { app, productService, reportService } = createTestApp();
    const auth = { Authorization: `Bearer ${"a".repeat(32)}` };
    await request(app)
      .post("/mcp")
      .set(auth)
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_shop_menu", arguments: { query: "bad" } },
      })
      .expect(400);
    await request(app)
      .post("/mcp")
      .set(auth)
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "write_order", arguments: {} },
      })
      .expect(400);
    expect(productService.listPublic).not.toHaveBeenCalled();
    expect(reportService.getSummary).not.toHaveBeenCalled();
  });
});
