import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";

import type {
  StaffAccountListFilters,
  StaffAccountRecord,
  StaffAccountRepository,
  StaffAccountWriteData,
} from "../src/repositories/user-repository.js";
import { createStaffAccountService } from "../src/services/staff-account-service.js";

const ADMIN_ID = "507f1f77bcf86cd799439011";
const STAFF_ID = "507f1f77bcf86cd799439012";

const createAccount = (overrides: Partial<StaffAccountRecord> = {}): StaffAccountRecord => ({
  id: STAFF_ID,
  name: "Counter Staff",
  email: "staff@example.com",
  role: "STAFF",
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

class InMemoryStaffAccountRepository implements StaffAccountRepository {
  public readonly accounts = new Map<string, StaffAccountRecord>();
  public readonly passwordHashes = new Map<string, string>();
  public lastListFilters: StaffAccountListFilters | null = null;

  public async list(filters: StaffAccountListFilters) {
    this.lastListFilters = filters;
    const items = [...this.accounts.values()];

    return {
      items,
      meta: { page: filters.page, limit: filters.limit, total: items.length, totalPages: 1 },
    };
  }

  public async findAccountById(id: string): Promise<StaffAccountRecord | null> {
    return this.accounts.get(id) ?? null;
  }

  public async createAccount(data: StaffAccountWriteData): Promise<StaffAccountRecord> {
    const id = `507f1f77bcf86cd7994390${this.accounts.size + 20}`;
    const account = createAccount({
      id,
      name: data.name,
      email: data.email,
      role: data.role,
      isActive: data.isActive,
    });
    this.accounts.set(id, account);
    this.passwordHashes.set(id, data.passwordHash);

    return account;
  }

  public async updateAccountById(
    id: string,
    data: Partial<StaffAccountWriteData>,
  ): Promise<StaffAccountRecord | null> {
    const existing = this.accounts.get(id);

    if (!existing) {
      return null;
    }

    const updated = {
      ...existing,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    };
    this.accounts.set(id, updated);

    if (data.passwordHash !== undefined) {
      this.passwordHashes.set(id, data.passwordHash);
    }

    return updated;
  }
}

describe("staff account service", () => {
  it("passes pagination, search, role, and active filters to the repository", async () => {
    const repository = new InMemoryStaffAccountRepository();
    const service = createStaffAccountService(repository);

    await service.list({
      page: 2,
      limit: 10,
      search: "counter",
      role: "STAFF",
      active: true,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(repository.lastListFilters).toEqual({
      page: 2,
      limit: 10,
      search: "counter",
      role: "STAFF",
      isActive: true,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("hashes a password before creating an account", async () => {
    const repository = new InMemoryStaffAccountRepository();
    const service = createStaffAccountService(repository);
    const password = "SecureStaffPassword123";

    const account = await service.create({
      name: "New Staff",
      email: "new.staff@example.com",
      password,
      role: "STAFF",
      isActive: true,
    });
    const passwordHash = repository.passwordHashes.get(account.id);

    expect(passwordHash).toBeDefined();
    await expect(bcrypt.compare(password, passwordHash ?? "")).resolves.toBe(true);
    expect(account).not.toHaveProperty("passwordHash");
  });

  it("prevents an administrator from deactivating or demoting their own account", async () => {
    const repository = new InMemoryStaffAccountRepository();
    repository.accounts.set(
      ADMIN_ID,
      createAccount({ id: ADMIN_ID, email: "admin@example.com", role: "ADMIN" }),
    );
    const service = createStaffAccountService(repository);

    await expect(service.update(ADMIN_ID, ADMIN_ID, { isActive: false })).rejects.toMatchObject({
      statusCode: 409,
      code: "SELF_ACCESS_CHANGE_NOT_ALLOWED",
    });
    await expect(service.update(ADMIN_ID, ADMIN_ID, { role: "STAFF" })).rejects.toMatchObject({
      statusCode: 409,
      code: "SELF_ACCESS_CHANGE_NOT_ALLOWED",
    });
  });

  it("updates another account and hashes an optional replacement password", async () => {
    const repository = new InMemoryStaffAccountRepository();
    repository.accounts.set(STAFF_ID, createAccount());
    const service = createStaffAccountService(repository);
    const password = "ReplacementPassword123";

    const account = await service.update(ADMIN_ID, STAFF_ID, {
      name: "Updated Staff",
      isActive: false,
      password,
    });
    const passwordHash = repository.passwordHashes.get(STAFF_ID);

    expect(account).toMatchObject({ name: "Updated Staff", isActive: false });
    await expect(bcrypt.compare(password, passwordHash ?? "")).resolves.toBe(true);
  });

  it("returns a safe not-found error", async () => {
    const service = createStaffAccountService(new InMemoryStaffAccountRepository());

    await expect(
      service.update(ADMIN_ID, STAFF_ID, { name: "Missing Staff" }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "STAFF_ACCOUNT_NOT_FOUND",
    });
  });
});
