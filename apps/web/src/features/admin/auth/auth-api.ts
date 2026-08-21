import { apiGet, apiPost } from "../../../lib/api-client.js";
import type { StaffUser } from "../../../types/auth.js";

export interface LoginRequest {
  email: string;
  password: string;
}

export const getCurrentUser = async (signal?: AbortSignal): Promise<StaffUser> => {
  const response = await apiGet<{ user: StaffUser }>("/api/auth/me", signal);

  return response.data.user;
};

export const login = async (request: LoginRequest): Promise<StaffUser> => {
  const response = await apiPost<{ user: StaffUser }, LoginRequest>("/api/auth/login", request);

  return response.data.user;
};

export const logout = async (): Promise<void> => {
  await apiPost<{ loggedOut: boolean }, Record<string, never>>("/api/auth/logout", {});
};
