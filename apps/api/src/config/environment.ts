import { z } from "zod";

import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
} from "../agents/openai-embeddings.js";

const blankAsUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  MONGODB_URI: z.string().trim().min(1, "MONGODB_URI is required"),
  MONGODB_DNS_SERVERS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((server) => server.trim())
            .filter(Boolean)
        : [],
    ),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must contain at least 32 characters")
    .refine(
      (value) => !value.toLowerCase().includes("replace-with"),
      "JWT_SECRET must be replaced with a random secret",
    ),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, "JWT_EXPIRES_IN must use a value such as 15m or 1h")
    .default("15m"),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  SHOP_TIMEZONE: z
    .string()
    .trim()
    .min(1)
    .refine((timezone) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: timezone });
        return true;
      } catch {
        return false;
      }
    }, "SHOP_TIMEZONE must be a valid IANA timezone")
    .default("Asia/Kolkata"),
  TAX_PERCENTAGE: z.coerce.number().min(0).max(100).default(0),
  OPENAI_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-5.4-mini"),
  // Hybrid knowledge retrieval. Embeddings use OPENAI_API_KEY; without it retrieval is keyword-only.
  // Blank values (e.g. `OPENAI_EMBEDDING_DIMENSIONS=` in .env) use the defaults.
  OPENAI_EMBEDDING_MODEL: z.preprocess(
    blankAsUndefined,
    z.string().trim().min(1).default(DEFAULT_EMBEDDING_MODEL),
  ),
  OPENAI_EMBEDDING_DIMENSIONS: z.preprocess(
    blankAsUndefined,
    z.coerce.number().int().min(64).max(3072).default(DEFAULT_EMBEDDING_DIMENSIONS),
  ),
  // "memory" works on any MongoDB. "atlas" needs the index from `npm run knowledge:index`.
  KNOWLEDGE_VECTOR_SEARCH: z.preprocess(
    blankAsUndefined,
    z.enum(["memory", "atlas"]).default("memory"),
  ),
  // Optional: without it the /api/mcp route is not mounted.
  MCP_SERVER_TOKEN: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .refine(
      (value) => value === undefined || value.length >= 32,
      "MCP_SERVER_TOKEN must contain at least 32 characters",
    ),
  GAME_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  GAME_ROOM_TTL_MINUTES: z.coerce.number().int().min(5).max(720).default(60),
  GAME_RESULT_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  GAME_MAX_ROOMS_PER_IP_PER_HOUR: z.coerce.number().int().min(1).max(1000).default(10),
});

export type Environment = z.infer<typeof environmentSchema>;

export const loadEnvironment = (values: NodeJS.ProcessEnv = process.env): Environment => {
  const result = environmentSchema.safeParse(values);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return result.data;
};
