import { describe, expect, it } from "vitest";

import vercelConfiguration from "../vercel.json";
import {
  isGameSocketMisconfigured,
  resolveApiBaseUrl,
  resolveGameSocketUrl,
} from "../src/config/environment.js";

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

describe("game socket routing", () => {
  // A Vercel rewrite cannot carry a WebSocket upgrade, so the game socket has to
  // reach Render directly rather than reusing the proxied browser origin.
  it("falls back to the configured API origin, not the browser origin", () => {
    expect(
      resolveGameSocketUrl({
        configuredSocketUrl: "",
        configuredApiBaseUrl: "https://south-india-coffee-shop-api.onrender.com/",
      }),
    ).toBe("https://south-india-coffee-shop-api.onrender.com");
  });

  it("prefers an explicit socket URL when one is configured", () => {
    expect(
      resolveGameSocketUrl({
        configuredSocketUrl: "https://games.example.com/",
        configuredApiBaseUrl: "https://south-india-coffee-shop-api.onrender.com",
      }),
    ).toBe("https://games.example.com");
  });

  // REST ignores VITE_API_BASE_URL on a deployed HTTPS origin, so it is easy to
  // leave unset on the host and never notice until the lobby will not connect.
  it("flags a deployed build still pointing the socket at localhost", () => {
    expect(
      isGameSocketMisconfigured({
        socketUrl: "http://localhost:4000",
        browserOrigin: "https://jrgsouthindiacoffeeshop.vercel.app",
        isProduction: true,
      }),
    ).toBe(true);
  });

  it("accepts a deployed build pointing at the HTTPS API origin", () => {
    expect(
      isGameSocketMisconfigured({
        socketUrl: "https://south-india-coffee-shop-api.onrender.com",
        browserOrigin: "https://jrgsouthindiacoffeeshop.vercel.app",
        isProduction: true,
      }),
    ).toBe(false);
  });

  it("leaves local development alone", () => {
    expect(
      isGameSocketMisconfigured({
        socketUrl: "http://localhost:4000",
        browserOrigin: "http://localhost:5173",
        isProduction: false,
      }),
    ).toBe(false);
  });
});
