import bcrypt from "bcrypt";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { UserRecord, UserRepository } from "../src/repositories/user-repository.js";
import { createAuthService } from "../src/services/auth-service.js";

const TEST_PASSWORD = "StrongTestPassword123";
const TEST_JWT_SECRET = "a-secure-test-secret-with-more-than-32-characters";

let passwordHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
});

const createUser = (overrides: Partial<UserRecord> = {}): UserRecord => ({
  id: "507f1f77bcf86cd799439011",
  name: "Test Admin",
  email: "admin@example.com",
  passwordHash,
  role: "ADMIN",
  isActive: true,
  ...overrides,
});

const createTestApp = (user: UserRecord | null = createUser()) => {
  const userRepository: UserRepository = {
    async findByEmail(email) {
      return user?.email === email ? user : null;
    },
    async findById(id) {
      return user?.id === id ? user : null;
    },
  };
  const authService = createAuthService({
    userRepository,
    jwtSecret: TEST_JWT_SECRET,
    jwtExpiresIn: "15m",
  });

  return createApp({
    clientUrl: "http://localhost:5173",
    authService,
    isProduction: false,
    databaseState: () => "connected",
    enableRequestLogging: false,
  });
};

describe("staff authentication", () => {
  it("logs in with valid credentials and returns the current user", async () => {
    const agent = request.agent(createTestApp());

    const loginResponse = await agent.post("/api/auth/login").send({
      email: "ADMIN@EXAMPLE.COM",
      password: TEST_PASSWORD,
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toEqual({
      success: true,
      data: {
        user: {
          id: "507f1f77bcf86cd799439011",
          name: "Test Admin",
          email: "admin@example.com",
          role: "ADMIN",
        },
      },
      meta: {},
      error: null,
    });
    const cookieHeaders = loginResponse.headers["set-cookie"] as string[] | undefined;
    expect(cookieHeaders?.[0]).toContain("staff_access_token=");
    expect(cookieHeaders?.[0]).toContain("HttpOnly");
    expect(cookieHeaders?.[0]).toContain("SameSite=Lax");

    const meResponse = await agent.get("/api/auth/me");

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.data.user.email).toBe("admin@example.com");
    expect(meResponse.body.data.user).not.toHaveProperty("passwordHash");
  });

  it("rejects an invalid password with a generic message", async () => {
    const response = await request(createTestApp()).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "incorrect-password",
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toEqual({
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password",
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects an inactive staff account", async () => {
    const response = await request(createTestApp(createUser({ isActive: false })))
      .post("/api/auth/login")
      .send({
        email: "admin@example.com",
        password: TEST_PASSWORD,
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("validates login input", async () => {
    const response = await request(createTestApp()).post("/api/auth/login").send({
      email: "not-an-email",
      password: TEST_PASSWORD,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires an access-token cookie for the current-user endpoint", async () => {
    const response = await request(createTestApp()).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("clears the access-token cookie on logout", async () => {
    const response = await request(createTestApp()).post("/api/auth/logout");
    const cookieHeaders = response.headers["set-cookie"] as string[] | undefined;

    expect(response.status).toBe(200);
    expect(cookieHeaders?.[0]).toContain("staff_access_token=");
    expect(cookieHeaders?.[0]).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  });
});
