import { z } from "zod";

const environmentSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default("http://localhost:4000"),
  VITE_SHOP_NAME: z.string().trim().min(1).default("JRG South India Coffee Shop"),
});

const parsedEnvironment = environmentSchema.parse(import.meta.env);
const configuredShopName = parsedEnvironment.VITE_SHOP_NAME;

export const environment = {
  apiBaseUrl: parsedEnvironment.VITE_API_BASE_URL.replace(/\/$/, ""),
  shopName:
    configuredShopName === "South India Coffee Shop"
      ? "JRG South India Coffee Shop"
      : configuredShopName,
};
