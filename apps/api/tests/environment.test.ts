import { describe, expect, it } from "vitest";

import { loadEnvironment } from "../src/config/environment.js";

const VALID_JWT_SECRET = "a-secure-test-secret-with-32-characters";

describe("loadEnvironment", () => {
  it("parses and defaults valid environment values", () => {
    const environment = loadEnvironment({
      MONGODB_URI: "mongodb://localhost:27017/test",
      JWT_SECRET: VALID_JWT_SECRET,
    });

    expect(environment).toMatchObject({
      NODE_ENV: "development",
      PORT: 4000,
      MONGODB_DNS_SERVERS: [],
      CLIENT_URL: "http://localhost:5173",
      SHOP_TIMEZONE: "Asia/Kolkata",
      TAX_PERCENTAGE: 0,
    });
  });

  it("parses configured MongoDB DNS servers", () => {
    const environment = loadEnvironment({
      MONGODB_URI: "mongodb://localhost:27017/test",
      MONGODB_DNS_SERVERS: "1.1.1.1, 8.8.8.8",
      JWT_SECRET: VALID_JWT_SECRET,
    });

    expect(environment.MONGODB_DNS_SERVERS).toEqual(["1.1.1.1", "8.8.8.8"]);
  });

  it("rejects a missing MongoDB connection string", () => {
    expect(() => loadEnvironment({ JWT_SECRET: VALID_JWT_SECRET })).toThrow(/MONGODB_URI/);
  });

  it("rejects a short JWT secret", () => {
    expect(() =>
      loadEnvironment({
        MONGODB_URI: "mongodb://localhost:27017/test",
        JWT_SECRET: "too-short",
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it("rejects the example JWT secret", () => {
    expect(() =>
      loadEnvironment({
        MONGODB_URI: "mongodb://localhost:27017/test",
        JWT_SECRET: "replace-with-a-random-secret-containing-at-least-32-characters",
      }),
    ).toThrow(/must be replaced/);
  });

  it("rejects an invalid shop timezone", () => {
    expect(() =>
      loadEnvironment({
        MONGODB_URI: "mongodb://localhost:27017/test",
        JWT_SECRET: VALID_JWT_SECRET,
        SHOP_TIMEZONE: "Not/A-Timezone",
      }),
    ).toThrow(/SHOP_TIMEZONE/);
  });
});
