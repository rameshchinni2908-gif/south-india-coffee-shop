import { z } from "zod";

const environmentSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default("http://localhost:4000"),
  VITE_SHOP_NAME: z.string().trim().min(1).default("JRG South India Coffee Shop"),
});

const parsedEnvironment = environmentSchema.parse(import.meta.env);
const configuredShopName = parsedEnvironment.VITE_SHOP_NAME;

interface ResolveApiBaseUrlOptions {
  configuredApiBaseUrl: string;
  browserOrigin: string;
  isProduction: boolean;
}

export const resolveApiBaseUrl = ({
  configuredApiBaseUrl,
  browserOrigin,
  isProduction,
}: ResolveApiBaseUrlOptions): string => {
  const normalizedConfiguredUrl = configuredApiBaseUrl.replace(/\/$/, "");

  // Vercel proxies /api to Render in production so the HTTP-only staff cookie
  // remains first-party in browsers that block cross-site cookies, including Safari.
  return isProduction && browserOrigin.startsWith("https://")
    ? browserOrigin.replace(/\/$/, "")
    : normalizedConfiguredUrl;
};

export const environment = {
  apiBaseUrl: resolveApiBaseUrl({
    configuredApiBaseUrl: parsedEnvironment.VITE_API_BASE_URL,
    browserOrigin: window.location.origin,
    isProduction: import.meta.env.PROD,
  }),
  shopName:
    configuredShopName === "South India Coffee Shop"
      ? "JRG South India Coffee Shop"
      : configuredShopName,
};
