import type { AuthenticatedUser } from "../services/auth-service.js";

declare module "express-serve-static-core" {
  interface Request {
    authenticatedUser?: AuthenticatedUser;
    validatedParams?: unknown;
    validatedQuery?: unknown;
  }
}
