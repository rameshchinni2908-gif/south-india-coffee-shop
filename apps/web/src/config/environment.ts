import { z } from "zod";

const environmentSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default("http://localhost:4000"),
  VITE_SHOP_NAME: z.string().trim().min(1).default("South India Coffee Shop"),
});

const parsedEnvironment = environmentSchema.parse(import.meta.env);

export const environment = {
  apiBaseUrl: parsedEnvironment.VITE_API_BASE_URL.replace(/\/$/, ""),
  shopName: parsedEnvironment.VITE_SHOP_NAME,
};
