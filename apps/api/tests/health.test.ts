import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { unusedAuthService } from "./helpers/test-auth-service.js";

describe("GET /api/health", () => {
  it("returns a healthy response when MongoDB is connected", async () => {
    const app = createApp({
      clientUrl: "http://localhost:5173",
      authService: unusedAuthService,
      isProduction: false,
      databaseState: () => "connected",
      enableRequestLogging: false,
    });

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: "ok",
        database: "connected",
      },
      meta: {},
      error: null,
    });
    expect(response.body.data.timestamp).toEqual(expect.any(String));
  });

  it("returns service unavailable when MongoDB is disconnected", async () => {
    const app = createApp({
      clientUrl: "http://localhost:5173",
      authService: unusedAuthService,
      isProduction: false,
      databaseState: () => "disconnected",
      enableRequestLogging: false,
    });

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      data: {
        status: "unavailable",
        database: "disconnected",
      },
      error: {
        code: "DATABASE_UNAVAILABLE",
      },
    });
  });
});
