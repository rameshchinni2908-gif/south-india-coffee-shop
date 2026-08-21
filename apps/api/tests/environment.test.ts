import { describe, expect, it } from "vitest";

import { loadEnvironment } from "../src/config/environment.js";

describe("loadEnvironment", () => {
  it("parses and defaults valid environment values", () => {
    const environment = loadEnvironment({
      MONGODB_URI: "mongodb://localhost:27017/test",
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
    });

    expect(environment.MONGODB_DNS_SERVERS).toEqual(["1.1.1.1", "8.8.8.8"]);
  });

  it("rejects a missing MongoDB connection string", () => {
    expect(() => loadEnvironment({})).toThrow(/MONGODB_URI/);
  });
});
