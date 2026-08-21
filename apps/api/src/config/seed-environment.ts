import { z } from "zod";

const seedEnvironmentSchema = z.object({
  SEED_ADMIN_NAME: z.string().trim().min(2).max(100),
  SEED_ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
  SEED_ADMIN_PASSWORD: z
    .string()
    .min(12)
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= 72,
      "SEED_ADMIN_PASSWORD must not exceed 72 UTF-8 bytes",
    ),
});

export type SeedEnvironment = z.infer<typeof seedEnvironmentSchema>;

export const loadSeedEnvironment = (values: NodeJS.ProcessEnv = process.env): SeedEnvironment => {
  const result = seedEnvironmentSchema.safeParse(values);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid admin seed configuration: ${issues}`);
  }

  return result.data;
};
