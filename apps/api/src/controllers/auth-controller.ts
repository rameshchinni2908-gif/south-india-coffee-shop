import type { CookieOptions, RequestHandler } from "express";

import { ACCESS_TOKEN_COOKIE_NAME } from "../middleware/authenticate-staff.js";
import { HttpError } from "../middleware/http-error.js";
import type { AuthService } from "../services/auth-service.js";
import type { LoginInput } from "../validation/auth-schemas.js";

interface CreateAuthControllerOptions {
  authService: AuthService;
  isProduction: boolean;
}

const getCookieOptions = (isProduction: boolean): CookieOptions => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
});

export const createAuthController = ({
  authService,
  isProduction,
}: CreateAuthControllerOptions): {
  login: RequestHandler;
  logout: RequestHandler;
  me: RequestHandler;
} => {
  const cookieOptions = getCookieOptions(isProduction);

  return {
    login: async (request, response, next) => {
      try {
        const result = await authService.login(request.body as LoginInput);

        response
          .cookie(ACCESS_TOKEN_COOKIE_NAME, result.accessToken, cookieOptions)
          .status(200)
          .json({
            success: true,
            data: { user: result.user },
            meta: {},
            error: null,
          });
      } catch (error) {
        next(error);
      }
    },

    logout: (_request, response) => {
      response
        .clearCookie(ACCESS_TOKEN_COOKIE_NAME, cookieOptions)
        .status(200)
        .json({
          success: true,
          data: { loggedOut: true },
          meta: {},
          error: null,
        });
    },

    me: (request, response, next) => {
      if (!request.authenticatedUser) {
        next(new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required"));
        return;
      }

      response.status(200).json({
        success: true,
        data: { user: request.authenticatedUser },
        meta: {},
        error: null,
      });
    },
  };
};
