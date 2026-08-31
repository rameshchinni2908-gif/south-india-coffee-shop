import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { HttpError } from "../src/middleware/http-error.js";
import type { AuthService } from "../src/services/auth-service.js";
import type { StaffAccountService } from "../src/services/staff-account-service.js";

const ADMIN_ID = "507f1f77bcf86cd799439011";
const STAFF_ID = "507f1f77bcf86cd799439012";

const staffAccount = {
  id: STAFF_ID,
  name: "Counter Staff",
  email: "staff@example.com",
  role: "STAFF" as const,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const authService: AuthService = {
  async login() {
    throw new HttpError(500, "UNEXPECTED_LOGIN", "Login was not expected");
  },
  async authenticateAccessToken(accessToken) {
    if (accessToken !== "admin-token" && accessToken !== "staff-token") {
      throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    }

    return {
      id: accessToken === "admin-token" ? ADMIN_ID : STAFF_ID,
      name: accessToken === "admin-token" ? "Admin User" : "Staff User",
      email: accessToken === "admin-token" ? "admin@example.com" : "staff@example.com",
      role: accessToken === "admin-token" ? "ADMIN" : "STAFF",
    };
  },
};

const createTestApp = (service: StaffAccountService) =>
  createApp({
    clientUrl: "http://localhost:5173",
    authService,
    staffAccountService: service,
    isProduction: false,
    databaseState: () => "connected",
    enableRequestLogging: false,
  });

const createService = (): StaffAccountService => ({
  list: vi.fn().mockResolvedValue({
    items: [staffAccount],
    meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
  }),
  create: vi.fn().mockResolvedValue(staffAccount),
  update: vi.fn().mockResolvedValue({ ...staffAccount, isActive: false }),
});

describe("admin staff account API", () => {
  it("requires authentication", async () => {
    const response = await request(createTestApp(createService())).get("/api/admin/staff-accounts");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects STAFF users from every account-management endpoint", async () => {
    const app = createTestApp(createService());
    const cookie = "staff_access_token=staff-token";
    const responses = await Promise.all([
      request(app).get("/api/admin/staff-accounts").set("Cookie", cookie),
      request(app).post("/api/admin/staff-accounts").set("Cookie", cookie).send({
        name: "New User",
        email: "new@example.com",
        password: "SecurePassword123",
        role: "STAFF",
        isActive: true,
      }),
      request(app)
        .patch(`/api/admin/staff-accounts/${STAFF_ID}`)
        .set("Cookie", cookie)
        .send({ isActive: false }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([403, 403, 403]);
  });

  it("lists safe account data for an ADMIN", async () => {
    const response = await request(createTestApp(createService()))
      .get("/api/admin/staff-accounts?role=STAFF&active=true")
      .set("Cookie", "staff_access_token=admin-token");

    expect(response.status).toBe(200);
    expect(response.body.data.staffAccounts).toHaveLength(1);
    expect(response.body.data.staffAccounts[0]).not.toHaveProperty("passwordHash");
    expect(response.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it("validates account creation before calling the service", async () => {
    const service = createService();
    const response = await request(createTestApp(service))
      .post("/api/admin/staff-accounts")
      .set("Cookie", "staff_access_token=admin-token")
      .send({
        name: "New User",
        email: "NEW@EXAMPLE.COM",
        password: "short",
        role: "STAFF",
        isActive: true,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(service.create).not.toHaveBeenCalled();
  });

  it("creates and updates accounts through the ADMIN service", async () => {
    const service = createService();
    const app = createTestApp(service);
    const cookie = "staff_access_token=admin-token";
    const createResponse = await request(app)
      .post("/api/admin/staff-accounts")
      .set("Cookie", cookie)
      .send({
        name: "New User",
        email: "NEW@EXAMPLE.COM",
        password: "SecurePassword123",
        role: "STAFF",
        isActive: true,
      });
    const updateResponse = await request(app)
      .patch(`/api/admin/staff-accounts/${STAFF_ID}`)
      .set("Cookie", cookie)
      .send({ isActive: false });

    expect(createResponse.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@example.com" }),
    );
    expect(updateResponse.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(ADMIN_ID, STAFF_ID, { isActive: false });
  });
});
