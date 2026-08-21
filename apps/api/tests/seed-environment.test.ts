import { describe, expect, it } from "vitest";

import { loadSeedEnvironment } from "../src/config/seed-environment.js";

describe("loadSeedEnvironment", () => {
  it("normalizes valid first-admin settings", () => {
    const environment = loadSeedEnvironment({
      SEED_ADMIN_NAME: " Shop Owner ",
      SEED_ADMIN_EMAIL: "OWNER@EXAMPLE.COM",
      SEED_ADMIN_PASSWORD: "StrongPassword123",
    });

    expect(environment).toEqual({
      SEED_ADMIN_NAME: "Shop Owner",
      SEED_ADMIN_EMAIL: "owner@example.com",
      SEED_ADMIN_PASSWORD: "StrongPassword123",
    });
  });

  it("rejects a weak seed password", () => {
    expect(() =>
      loadSeedEnvironment({
        SEED_ADMIN_NAME: "Shop Owner",
        SEED_ADMIN_EMAIL: "owner@example.com",
        SEED_ADMIN_PASSWORD: "short",
      }),
    ).toThrow(/SEED_ADMIN_PASSWORD/);
  });
});
