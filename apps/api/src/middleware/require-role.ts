import type { RequestHandler } from "express";

import type { UserRole } from "../models/user-model.js";
import { HttpError } from "./http-error.js";

export const requireRoles = (...allowedRoles: UserRole[]): RequestHandler => {
  return (request, _response, next) => {
    if (!request.authenticatedUser) {
      next(new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required"));
      return;
    }

    if (!allowedRoles.includes(request.authenticatedUser.role)) {
      next(new HttpError(403, "FORBIDDEN", "You do not have permission to perform this action"));
      return;
    }

    next();
  };
};
