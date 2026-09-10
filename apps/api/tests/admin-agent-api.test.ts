import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { HttpError } from "../src/middleware/http-error.js";
import {
  createAdminAgentService,
  type AdminAgentService,
} from "../src/services/admin-agent-service.js";
import type { AuthService } from "../src/services/auth-service.js";

const authService: AuthService = {
  login: () => Promise.reject(new Error("Unexpected login")),
  authenticateAccessToken: (token) =>
    ["admin", "admin-two", "staff"].includes(token)
      ? Promise.resolve({
          id: token,
          name: "Test User",
          email: "test@example.com",
          role: token === "staff" ? "STAFF" : "ADMIN",
        })
      : Promise.reject(new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required")),
};
const createService = () => ({
  getStatus: vi.fn<AdminAgentService["getStatus"]>().mockReturnValue({ enabled: true }),
  createBriefing: vi.fn<AdminAgentService["createBriefing"]>().mockResolvedValue({
    answer: "Coffee powder — Regular is at 5.",
    usedShopData: true,
    generatedAt: "2026-09-10T08:00:00.000Z",
  }),
});
const createAgentApp = (adminAgentService: AdminAgentService = createService()) =>
  createApp({
    clientUrl: "https://shop.example.com",
    authService,
    adminAgentService,
    isProduction: true,
    databaseState: () => "connected",
    enableRequestLogging: false,
  });

describe("production admin agent API", () => {
  it.each([undefined, "expired"])(
    "requires a current authenticated session (%s)",
    async (token) => {
      const service = createService();
      const app = createAgentApp(service);
      for (const endpoint of ["status", "brief"]) {
        const call =
          endpoint === "status"
            ? request(app).get("/api/admin/agent/status")
            : request(app).post("/api/admin/agent/brief").send({ question: "Summarize today" });
        if (token) call.set("Cookie", `staff_access_token=${token}`);
        expect((await call).status).toBe(401);
      }
      expect(service.getStatus).not.toHaveBeenCalled();
      expect(service.createBriefing).not.toHaveBeenCalled();
    },
  );

  it("rejects staff on both endpoints before invoking the agent", async () => {
    const service = createService();
    const app = createAgentApp(service);
    expect(
      (await request(app).get("/api/admin/agent/status").set("Cookie", "staff_access_token=staff"))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/admin/agent/brief")
          .set("Cookie", "staff_access_token=staff")
          .send({ question: "Summarize today" })
      ).status,
    ).toBe(403);
    expect(service.getStatus).not.toHaveBeenCalled();
    expect(service.createBriefing).not.toHaveBeenCalled();
  });

  it("returns configuration status without generating a paid briefing", async () => {
    const service = createService();
    const response = await request(createAgentApp(service))
      .get("/api/admin/agent/status")
      .set("Cookie", "staff_access_token=admin");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { agent: { enabled: true } },
      meta: {},
      error: null,
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(service.createBriefing).not.toHaveBeenCalled();
  });

  it.each([undefined, "https://shop.example.com"])(
    "accepts an admin question from an allowed origin (%s)",
    async (origin) => {
      const service = createService();
      const call = request(createAgentApp(service))
        .post("/api/admin/agent/brief")
        .set("Cookie", "staff_access_token=admin")
        .send({ question: "  What needs attention?  " });
      if (origin) call.set("Origin", origin);
      const response = await call;
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          briefing: {
            answer: "Coffee powder — Regular is at 5.",
            usedShopData: true,
            generatedAt: "2026-09-10T08:00:00.000Z",
          },
        },
        meta: {},
        error: null,
      });
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(service.createBriefing).toHaveBeenCalledWith("What needs attention?");
    },
  );

  it.each(["https://untrusted.example.com", "null", "https://shop.example.com.evil.example"])(
    "rejects an untrusted browser origin (%s)",
    async (origin) => {
      const service = createService();
      const response = await request(createAgentApp(service))
        .post("/api/admin/agent/brief")
        .set("Cookie", "staff_access_token=admin")
        .set("Origin", origin)
        .send({ question: "Summarize today" });
      expect(response.status).toBe(403);
      expect(service.createBriefing).not.toHaveBeenCalled();
    },
  );

  it.each([
    {},
    { question: " " },
    { question: "x".repeat(501) },
    { question: 1 },
    { question: "Summarize today", model: "other-model" },
  ])("validates the complete request body before calling the service", async (body) => {
    const service = createService();
    const response = await request(createAgentApp(service))
      .post("/api/admin/agent/brief")
      .set("Cookie", "staff_access_token=admin")
      .send(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(service.createBriefing).not.toHaveBeenCalled();
  });

  it("caps paid requests per admin while allowing a different admin and free status reads", async () => {
    const service = createService();
    const app = createAgentApp(service);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        (
          await request(app)
            .post("/api/admin/agent/brief")
            .set("Cookie", "staff_access_token=admin")
            .send({ question: "Summarize today" })
        ).status,
      ).toBe(200);
    }
    const limited = await request(app)
      .post("/api/admin/agent/brief")
      .set("Cookie", "staff_access_token=admin")
      .send({ question: "Summarize today" });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("AGENT_RATE_LIMITED");
    expect(service.createBriefing).toHaveBeenCalledTimes(5);
    expect(
      (await request(app).get("/api/admin/agent/status").set("Cookie", "staff_access_token=admin"))
        .status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/admin/agent/brief")
          .set("Cookie", "staff_access_token=admin-two")
          .send({ question: "Summarize today" })
      ).status,
    ).toBe(200);
  });

  it("reports missing server configuration safely and keeps health checks working", async () => {
    const service = createAdminAgentService({ reportService: { getSummary: vi.fn() } });
    const app = createAgentApp(service);
    const status = await request(app)
      .get("/api/admin/agent/status")
      .set("Cookie", "staff_access_token=admin");
    expect(status.body.data.agent.enabled).toBe(false);
    const response = await request(app)
      .post("/api/admin/agent/brief")
      .set("Cookie", "staff_access_token=admin")
      .send({ question: "Summarize today" });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AGENT_NOT_CONFIGURED");
    expect((await request(app).get("/api/health")).status).toBe(200);
  });

  it("returns a safe provider failure response without exposing secrets", async () => {
    const service = createAdminAgentService({
      reportService: { getSummary: vi.fn() },
      respond: vi.fn().mockRejectedValue(new Error("secret-api-key private-provider-body")),
    });
    const response = await request(createAgentApp(service))
      .post("/api/admin/agent/brief")
      .set("Cookie", "staff_access_token=admin")
      .send({ question: "Summarize today" });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AGENT_UNAVAILABLE");
    expect(response.text).not.toMatch(/secret-api-key|private-provider-body|stack/);
  });
});
