import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { errorHandler } from "../src/middleware/error-handler.js";
import { requireRoles } from "../src/middleware/require-role.js";
import type { UserRole } from "../src/models/user-model.js";

const createRoleTestApp = (role?: UserRole) => {
  const app = express();
  const setAuthenticatedUser: RequestHandler = (request, _response, next) => {
    if (role) {
      request.authenticatedUser = {
        id: "507f1f77bcf86cd799439011",
        name: "Test User",
        email: "staff@example.com",
        role,
      };
    }

    next();
  };

  app.get("/admin-only", setAuthenticatedUser, requireRoles("ADMIN"), (_request, response) =>
    response.status(200).json({ allowed: true }),
  );
  app.use(errorHandler);

  return app;
};

describe("requireRoles", () => {
  it("allows an ADMIN", async () => {
    const response = await request(createRoleTestApp("ADMIN")).get("/admin-only");

    expect(response.status).toBe(200);
  });

  it("rejects a STAFF member from an ADMIN-only route", async () => {
    const response = await request(createRoleTestApp("STAFF")).get("/admin-only");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(createRoleTestApp()).get("/admin-only");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });
});
