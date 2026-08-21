import { UserModel, type UserRole } from "../models/user-model.js";

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

const toUserRecord = (user: InstanceType<typeof UserModel>): UserRecord => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  passwordHash: user.passwordHash,
  role: user.role,
  isActive: user.isActive,
});

export class MongooseUserRepository implements UserRepository {
  public async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await UserModel.findOne({ email }).select("+passwordHash").exec();

    return user ? toUserRecord(user) : null;
  }

  public async findById(id: string): Promise<UserRecord | null> {
    const user = await UserModel.findById(id).select("+passwordHash").exec();

    return user ? toUserRecord(user) : null;
  }
}
