import type { RequestHandler } from "express";

import type { AuthService } from "../services/auth-service.js";
import { readCookie } from "../utils/cookies.js";
import { HttpError } from "./http-error.js";

export const ACCESS_TOKEN_COOKIE_NAME = "staff_access_token";

export const createAuthenticateStaff = (authService: AuthService): RequestHandler => {
  return async (request, _response, next) => {
    const accessToken = readCookie(request.headers.cookie, ACCESS_TOKEN_COOKIE_NAME);

    if (!accessToken) {
      next(new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required"));
      return;
    }

    try {
      request.authenticatedUser = await authService.authenticateAccessToken(accessToken);
      next();
    } catch (error) {
      next(error);
    }
  };
};
