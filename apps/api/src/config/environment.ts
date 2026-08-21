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
  SHOP_TIMEZONE: z.string().trim().min(1).default("Asia/Kolkata"),
  TAX_PERCENTAGE: z.coerce.number().min(0).default(0),
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
