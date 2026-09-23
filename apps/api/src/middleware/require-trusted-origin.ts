import type { RequestHandler } from "express";

import { HttpError } from "./http-error.js";

// Browsers send Origin on cross-site requests; reject any page other than the shop's own.
export const createRequireTrustedOrigin = (clientUrl: string): RequestHandler => {
  const allowedOrigin = new URL(clientUrl).origin;
  return (request, _response, next) => {
    const origin = request.get("Origin");
    if (origin !== undefined && origin !== allowedOrigin) {
      next(new HttpError(403, "FORBIDDEN", "This request origin is not permitted."));
      return;
    }
    next();
  };
};
