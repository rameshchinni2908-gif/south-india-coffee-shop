import bcrypt from "bcrypt";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { z } from "zod";

import { HttpError } from "../middleware/http-error.js";
import { USER_ROLES, type UserRole } from "../models/user-model.js";
import type { UserRepository } from "../repositories/user-repository.js";
import type { LoginInput } from "../validation/auth-schemas.js";

const tokenPayloadSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(USER_ROLES),
});

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface LoginResult {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface AuthService {
  login(input: LoginInput): Promise<LoginResult>;
  authenticateAccessToken(accessToken: string): Promise<AuthenticatedUser>;
}

interface CreateAuthServiceOptions {
  userRepository: UserRepository;
  jwtSecret: string;
  jwtExpiresIn: string;
}

const toAuthenticatedUser = (user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}): AuthenticatedUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});

export const createAuthService = ({
  userRepository,
  jwtSecret,
  jwtExpiresIn,
}: CreateAuthServiceOptions): AuthService => ({
  async login(input) {
    const user = await userRepository.findByEmail(input.email);

    if (!user || !user.isActive) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);

    if (!passwordMatches) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const signOptions: SignOptions = {
      algorithm: "HS256",
      expiresIn: jwtExpiresIn as NonNullable<SignOptions["expiresIn"]>,
      subject: user.id,
    };
    const accessToken = jwt.sign({ role: user.role }, jwtSecret, signOptions);

    return {
      accessToken,
      user: toAuthenticatedUser(user),
    };
  },

  async authenticateAccessToken(accessToken) {
    let decoded: string | JwtPayload;

    try {
      decoded = jwt.verify(accessToken, jwtSecret, { algorithms: ["HS256"] });
    } catch {
      throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    }

    const payload = tokenPayloadSchema.safeParse(decoded);

    if (!payload.success) {
      throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    }

    const user = await userRepository.findById(payload.data.sub);

    if (!user || !user.isActive || user.role !== payload.data.role) {
      throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    }

    return toAuthenticatedUser(user);
  },
});
