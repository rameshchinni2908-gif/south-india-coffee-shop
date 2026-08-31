import bcrypt from "bcrypt";

import { HttpError } from "../middleware/http-error.js";
import type {
  StaffAccountListFilters,
  StaffAccountListResult,
  StaffAccountRecord,
  StaffAccountRepository,
  StaffAccountWriteData,
} from "../repositories/user-repository.js";
import type {
  CreateStaffAccountInput,
  StaffAccountQuery,
  UpdateStaffAccountInput,
} from "../validation/staff-account-schemas.js";

const PASSWORD_HASH_ROUNDS = 12;

export interface StaffAccountService {
  list(query: StaffAccountQuery): Promise<StaffAccountListResult>;
  create(input: CreateStaffAccountInput): Promise<StaffAccountRecord>;
  update(
    authenticatedUserId: string,
    id: string,
    input: UpdateStaffAccountInput,
  ): Promise<StaffAccountRecord>;
}

export const createStaffAccountService = (
  staffAccountRepository: StaffAccountRepository,
): StaffAccountService => ({
  list(query) {
    const filters: StaffAccountListFilters = {
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };

    if (query.search !== undefined) {
      filters.search = query.search;
    }
    if (query.role !== undefined) {
      filters.role = query.role;
    }
    if (query.active !== undefined) {
      filters.isActive = query.active;
    }

    return staffAccountRepository.list(filters);
  },

  async create(input) {
    const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);

    return staffAccountRepository.createAccount({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      isActive: input.isActive,
    });
  },

  async update(authenticatedUserId, id, input) {
    const existingAccount = await staffAccountRepository.findAccountById(id);

    if (!existingAccount) {
      throw new HttpError(404, "STAFF_ACCOUNT_NOT_FOUND", "Staff account was not found");
    }

    if (
      authenticatedUserId === id &&
      (input.isActive === false || (input.role !== undefined && input.role !== "ADMIN"))
    ) {
      throw new HttpError(
        409,
        "SELF_ACCESS_CHANGE_NOT_ALLOWED",
        "You cannot deactivate or remove your own administrator access",
      );
    }

    const update: Partial<StaffAccountWriteData> = {};

    if (input.name !== undefined) {
      update.name = input.name;
    }
    if (input.email !== undefined) {
      update.email = input.email;
    }
    if (input.role !== undefined) {
      update.role = input.role;
    }
    if (input.isActive !== undefined) {
      update.isActive = input.isActive;
    }
    if (input.password !== undefined) {
      update.passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);
    }

    const updatedAccount = await staffAccountRepository.updateAccountById(id, update);

    if (!updatedAccount) {
      throw new HttpError(404, "STAFF_ACCOUNT_NOT_FOUND", "Staff account was not found");
    }

    return updatedAccount;
  },
});
