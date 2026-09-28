import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type {
  RestockPlannerService,
  RestockPlanView,
} from "../src/langgraph/restock-planner-service.js";
import { createApp } from "../src/app.js";
import { HttpError } from "../src/middleware/http-error.js";
import type { AuthService } from "../src/services/auth-service.js";

const RUN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const authService: AuthService = {
  login: () => Promise.reject(new Error("Unexpected login")),
  authenticateAccessToken: (token) =>
    ["admin", "staff"].includes(token)
      ? Promise.resolve({
          id: token,
          name: "User",
          email: "u@example.com",
          role: token === "staff" ? "STAFF" : "ADMIN",
        })
      : Promise.reject(new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required")),
};
const plan: RestockPlanView = {
  runId: RUN_ID,
  status: "AWAITING_APPROVAL",
  date: "2026-09-28",
  summary: null,
  items: [],
  results: [],
};
const createService = () => ({
  start: vi.fn<RestockPlannerService["start"]>().mockResolvedValue(plan),
  get: vi.fn<RestockPlannerService["get"]>().mockResolvedValue(plan),
  decide: vi
    .fn<RestockPlannerService["decide"]>()
    .mockResolvedValue({ ...plan, status: "COMPLETED" }),
});
const createPlannerApp = (service?: RestockPlannerService) =>
  createApp({
    clientUrl: "https://shop.example.com",
    authService,
    restockPlanner: { service },
    isProduction: true,
    databaseState: () => "connected",
    enableRequestLogging: false,
  });
const asAdmin = { Cookie: "staff_access_token=admin" };

describe("restock planner API", () => {
  it("is admin-only and reports whether it is enabled", async () => {
    expect(
      (await request(createPlannerApp()).get("/api/admin/restock-planner/status").set(asAdmin)).body
        .data.planner,
    ).toEqual({ enabled: false });
    const app = createPlannerApp(createService());
    expect(
      (await request(app).get("/api/admin/restock-planner/status").set(asAdmin)).body.data.planner,
    ).toEqual({ enabled: true });
    expect(
      (
        await request(app)
          .get("/api/admin/restock-planner/status")
          .set("Cookie", "staff_access_token=staff")
      ).status,
    ).toBe(403);
  });

  it("starts, reads and decides a plan as the signed-in admin", async () => {
    const service = createService();
    const app = createPlannerApp(service);

    expect((await request(app).post("/api/admin/restock-planner/runs").set(asAdmin)).status).toBe(
      200,
    );
    expect(service.start).toHaveBeenCalledWith("admin");
    expect(
      (await request(app).get(`/api/admin/restock-planner/runs/${RUN_ID}`).set(asAdmin)).body.data
        .plan.runId,
    ).toBe(RUN_ID);
    const decided = await request(app)
      .post(`/api/admin/restock-planner/runs/${RUN_ID}/decision`)
      .set(asAdmin)
      .send({ decisions: [{ variantId: "coffee-regular", quantity: 12 }] });
    expect(decided.body.data.plan.status).toBe("COMPLETED");
    expect(service.decide).toHaveBeenCalledWith(RUN_ID, "admin", [
      { variantId: "coffee-regular", quantity: 12 },
    ]);
  });

  it.each([
    [`/runs/not-a-uuid/decision`, { decisions: [] }],
    [`/runs/${RUN_ID}/decision`, { decisions: [{ variantId: "v", quantity: -1 }] }],
    [`/runs/${RUN_ID}/decision`, { decisions: [{ variantId: "v", quantity: 10_001 }] }],
    [
      `/runs/${RUN_ID}/decision`,
      {
        decisions: [
          { variantId: "v", quantity: 1 },
          { variantId: "v", quantity: 2 },
        ],
      },
    ],
    [`/runs/${RUN_ID}/decision`, { decisions: [], extra: true }],
  ])("rejects invalid decisions (%s)", async (path, body) => {
    const service = createService();
    const response = await request(createPlannerApp(service))
      .post(`/api/admin/restock-planner${path}`)
      .set(asAdmin)
      .send(body);
    expect(response.status).toBe(400);
    expect(service.decide).not.toHaveBeenCalled();
  });

  it("refuses writes from other sites and explains when disabled", async () => {
    const service = createService();
    expect(
      (
        await request(createPlannerApp(service))
          .post("/api/admin/restock-planner/runs")
          .set(asAdmin)
          .set("Origin", "https://elsewhere.example.com")
      ).status,
    ).toBe(403);
    expect(service.start).not.toHaveBeenCalled();

    const disabled = await request(createPlannerApp())
      .post("/api/admin/restock-planner/runs")
      .set(asAdmin);
    expect(disabled.status).toBe(503);
    expect(disabled.body.error.code).toBe("RESTOCK_PLANNER_DISABLED");
  });
});
