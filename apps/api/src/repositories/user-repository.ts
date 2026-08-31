import type { QueryFilter } from "mongoose";

import { UserModel, type UserRole } from "../models/user-model.js";
import { escapeRegExp } from "../utils/regex.js";

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
}

export interface StaffAccountRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffAccountWriteData {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
}

export interface StaffAccountListFilters {
  page: number;
  limit: number;
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  sortBy: "name" | "createdAt";
  sortOrder: "asc" | "desc";
}

export interface StaffAccountListResult {
  items: StaffAccountRecord[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface StaffAccountRepository {
  list(filters: StaffAccountListFilters): Promise<StaffAccountListResult>;
  findAccountById(id: string): Promise<StaffAccountRecord | null>;
  createAccount(data: StaffAccountWriteData): Promise<StaffAccountRecord>;
  updateAccountById(
    id: string,
    data: Partial<StaffAccountWriteData>,
  ): Promise<StaffAccountRecord | null>;
}

const toUserRecord = (user: InstanceType<typeof UserModel>): UserRecord => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  passwordHash: user.passwordHash,
  role: user.role,
  isActive: user.isActive,
});

const toStaffAccountRecord = (user: InstanceType<typeof UserModel>): StaffAccountRecord => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export class MongooseUserRepository implements UserRepository, StaffAccountRepository {
  public async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await UserModel.findOne({ email }).select("+passwordHash").exec();

    return user ? toUserRecord(user) : null;
  }

  public async findById(id: string): Promise<UserRecord | null> {
    const user = await UserModel.findById(id).select("+passwordHash").exec();

    return user ? toUserRecord(user) : null;
  }

  public async list(filters: StaffAccountListFilters): Promise<StaffAccountListResult> {
    const query: QueryFilter<InstanceType<typeof UserModel>> = {};

    if (filters.search) {
      const search = { $regex: escapeRegExp(filters.search), $options: "i" };
      query.$or = [{ name: search }, { email: search }];
    }
    if (filters.role !== undefined) {
      query.role = filters.role;
    }
    if (filters.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    const skip = (filters.page - 1) * filters.limit;
    const direction = filters.sortOrder === "asc" ? 1 : -1;
    const [users, total] = await Promise.all([
      UserModel.find(query)
        .sort({ [filters.sortBy]: direction, _id: direction })
        .skip(skip)
        .limit(filters.limit)
        .exec(),
      UserModel.countDocuments(query).exec(),
    ]);

    return {
      items: users.map(toStaffAccountRecord),
      meta: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  public async findAccountById(id: string): Promise<StaffAccountRecord | null> {
    const user = await UserModel.findById(id).exec();

    return user ? toStaffAccountRecord(user) : null;
  }

  public async createAccount(data: StaffAccountWriteData): Promise<StaffAccountRecord> {
    const user = await UserModel.create(data);

    return toStaffAccountRecord(user);
  }

  public async updateAccountById(
    id: string,
    data: Partial<StaffAccountWriteData>,
  ): Promise<StaffAccountRecord | null> {
    const user = await UserModel.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).exec();

    return user ? toStaffAccountRecord(user) : null;
  }
}
