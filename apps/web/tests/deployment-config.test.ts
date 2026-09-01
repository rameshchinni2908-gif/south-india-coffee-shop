import { describe, expect, it } from "vitest";

import vercelConfiguration from "../vercel.json";
import { resolveApiBaseUrl } from "../src/config/environment.js";

describe("deployed API routing", () => {
  it("uses the frontend origin for secure production deployments", () => {
    expect(
      resolveApiBaseUrl({
        configuredApiBaseUrl: "https://south-india-coffee-shop-api.onrender.com/",
        browserOrigin: "https://jrgsouthindiacoffeeshop.vercel.app",
        isProduction: true,
      }),
    ).toBe("https://jrgsouthindiacoffeeshop.vercel.app");
  });

  it("keeps the configured API URL for local development", () => {
    expect(
      resolveApiBaseUrl({
        configuredApiBaseUrl: "http://localhost:4000/",
        browserOrigin: "http://localhost:5173",
        isProduction: false,
      }),
    ).toBe("http://localhost:4000");
  });

  it("proxies API requests before applying the SPA fallback", () => {
    expect(vercelConfiguration.rewrites[0]).toEqual({
      source: "/api/:path*",
      destination: "https://south-india-coffee-shop-api.onrender.com/api/:path*",
    });
    expect(vercelConfiguration.rewrites.at(-1)).toEqual({
      source: "/(.*)",
      destination: "/index.html",
    });
  });
});
