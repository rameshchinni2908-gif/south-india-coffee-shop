import { z } from "zod";

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
