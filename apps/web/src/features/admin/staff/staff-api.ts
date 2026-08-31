import { apiGet, apiPatch, apiPost } from "../../../lib/api-client.js";
import type { PaginationMeta } from "../../../types/api.js";
import type { StaffAccount } from "../../../types/auth.js";

export type StaffRoleFilter = "ALL" | "ADMIN" | "STAFF";
export type StaffActiveFilter = "ALL" | "true" | "false";

export interface StaffAccountFilters {
  page: number;
  search: string;
  role: StaffRoleFilter;
  active: StaffActiveFilter;
}

export interface CreateStaffAccountInput {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "STAFF";
  isActive: boolean;
}

export interface UpdateStaffAccountInput {
  name: string;
  email: string;
  password?: string;
  role: "ADMIN" | "STAFF";
  isActive: boolean;
}

export const getStaffAccounts = async (
  filters: StaffAccountFilters,
  signal?: AbortSignal,
): Promise<{ staffAccounts: StaffAccount[]; meta: PaginationMeta }> => {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: "12",
    sortBy: "name",
    sortOrder: "asc",
  });

  if (filters.search) {
    params.set("search", filters.search);
  }
  if (filters.role !== "ALL") {
    params.set("role", filters.role);
  }
  if (filters.active !== "ALL") {
    params.set("active", filters.active);
  }

  const response = await apiGet<{ staffAccounts: StaffAccount[] }, PaginationMeta>(
    `/api/admin/staff-accounts?${params.toString()}`,
    signal,
  );

  return { staffAccounts: response.data.staffAccounts, meta: response.meta };
};

export const createStaffAccount = async (input: CreateStaffAccountInput): Promise<StaffAccount> => {
  const response = await apiPost<{ staffAccount: StaffAccount }, CreateStaffAccountInput>(
    "/api/admin/staff-accounts",
    input,
  );

  return response.data.staffAccount;
};

export const updateStaffAccount = async (
  id: string,
  input: UpdateStaffAccountInput,
): Promise<StaffAccount> => {
  const response = await apiPatch<{ staffAccount: StaffAccount }, UpdateStaffAccountInput>(
    `/api/admin/staff-accounts/${id}`,
    input,
  );

  return response.data.staffAccount;
};
