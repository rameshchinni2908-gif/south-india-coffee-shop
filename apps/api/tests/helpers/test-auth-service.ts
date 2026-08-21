import { HttpError } from "../../src/middleware/http-error.js";
import type { AuthService } from "../../src/services/auth-service.js";

export const unusedAuthService: AuthService = {
  async login() {
    throw new HttpError(500, "UNEXPECTED_AUTH_CALL", "Authentication was not expected");
  },
  async authenticateAccessToken() {
    throw new HttpError(500, "UNEXPECTED_AUTH_CALL", "Authentication was not expected");
  },
};
