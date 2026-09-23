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
      OPENAI_MODEL: "gpt-5.4-mini",
    });
  });

  it.each([undefined, "", "   "])("starts without an MCP server token (%s)", (token) => {
    const environment = loadEnvironment({
      MONGODB_URI: "mongodb://localhost:27017/test",
      JWT_SECRET: VALID_JWT_SECRET,
      ...(token === undefined ? {} : { MCP_SERVER_TOKEN: token }),
    });

    expect(environment.MCP_SERVER_TOKEN).toBeUndefined();
  });

  it("rejects a short MCP server token", () => {
    expect(() =>
      loadEnvironment({
        MONGODB_URI: "mongodb://localhost:27017/test",
        JWT_SECRET: VALID_JWT_SECRET,
        MCP_SERVER_TOKEN: "too-short",
      }),
    ).toThrow("MCP_SERVER_TOKEN must contain at least 32 characters");
  });

  it("defaults hybrid retrieval settings and treats blank values as unset", () => {
    const environment = loadEnvironment({
      MONGODB_URI: "mongodb://localhost:27017/test",
      JWT_SECRET: VALID_JWT_SECRET,
      OPENAI_EMBEDDING_DIMENSIONS: "",
      KNOWLEDGE_VECTOR_SEARCH: " ",
    });

    expect(environment).toMatchObject({
      OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
      OPENAI_EMBEDDING_DIMENSIONS: 512,
      KNOWLEDGE_VECTOR_SEARCH: "memory",
    });
    expect(() =>
      loadEnvironment({
        MONGODB_URI: "mongodb://localhost:27017/test",
        JWT_SECRET: VALID_JWT_SECRET,
        KNOWLEDGE_VECTOR_SEARCH: "pinecone",
      }),
    ).toThrow("KNOWLEDGE_VECTOR_SEARCH");
  });

  it.each([undefined, "", "   "])("allows an unconfigured assistant key (%s)", (apiKey) => {
    const environment = loadEnvironment({
      MONGODB_URI: "mongodb://localhost:27017/test",
      JWT_SECRET: VALID_JWT_SECRET,
      ...(apiKey === undefined ? {} : { OPENAI_API_KEY: apiKey }),
    });
    expect(environment.OPENAI_API_KEY).toBeUndefined();
  });

  it("accepts a configured assistant key and preserves the selected model", () => {
    const environment = loadEnvironment({
      MONGODB_URI: "mongodb://localhost:27017/test",
      JWT_SECRET: VALID_JWT_SECRET,
      OPENAI_API_KEY: " test-key ",
      OPENAI_MODEL: " gpt-5.4-nano ",
    });
    expect(environment.OPENAI_API_KEY).toBe("test-key");
    expect(environment.OPENAI_MODEL).toBe("gpt-5.4-nano");
  });

  it("rejects a blank assistant model without leaking the configured key", () => {
    expect(() =>
      loadEnvironment({
        MONGODB_URI: "mongodb://localhost:27017/test",
        JWT_SECRET: VALID_JWT_SECRET,
        OPENAI_API_KEY: "private-key-never-print",
        OPENAI_MODEL: " ",
      }),
    ).toThrow(/^Invalid environment configuration: OPENAI_MODEL:/);
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

  it("keeps the Kaapi Karts game disabled unless it is explicitly enabled", () => {
    const environment = loadEnvironment({
      MONGODB_URI: "mongodb://localhost:27017/test",
      JWT_SECRET: VALID_JWT_SECRET,
    });

    expect(environment).toMatchObject({
      GAME_ENABLED: false,
      GAME_ROOM_TTL_MINUTES: 60,
      GAME_RESULT_TTL_HOURS: 24,
      GAME_MAX_ROOMS_PER_IP_PER_HOUR: 10,
    });
  });

  it("enables the game only for the exact string true", () => {
    const enabled = loadEnvironment({
      MONGODB_URI: "mongodb://localhost:27017/test",
      JWT_SECRET: VALID_JWT_SECRET,
      GAME_ENABLED: "true",
    });

    expect(enabled.GAME_ENABLED).toBe(true);
    expect(() =>
      loadEnvironment({
        MONGODB_URI: "mongodb://localhost:27017/test",
        JWT_SECRET: VALID_JWT_SECRET,
        GAME_ENABLED: "yes",
      }),
    ).toThrow(/GAME_ENABLED/);
  });
});
