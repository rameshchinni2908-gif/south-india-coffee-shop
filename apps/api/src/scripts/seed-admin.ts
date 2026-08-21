import "dotenv/config";

import bcrypt from "bcrypt";
import pino from "pino";

import { configureDatabaseDns, connectDatabase, disconnectDatabase } from "../config/database.js";
import { loadEnvironment } from "../config/environment.js";
import { loadSeedEnvironment } from "../config/seed-environment.js";
import { UserModel } from "../models/user-model.js";

const PASSWORD_HASH_ROUNDS = 12;
const logger = pino();

const seedAdmin = async (): Promise<void> => {
  const environment = loadEnvironment();
  const seedEnvironment = loadSeedEnvironment();

  configureDatabaseDns(environment.MONGODB_DNS_SERVERS);
  await connectDatabase(environment.MONGODB_URI);

  try {
    const existingAdmin = await UserModel.exists({ email: seedEnvironment.SEED_ADMIN_EMAIL });

    if (existingAdmin) {
      logger.info("Admin seed skipped because the email already exists");
      return;
    }

    const passwordHash = await bcrypt.hash(
      seedEnvironment.SEED_ADMIN_PASSWORD,
      PASSWORD_HASH_ROUNDS,
    );
    const result = await UserModel.updateOne(
      { email: seedEnvironment.SEED_ADMIN_EMAIL },
      {
        $setOnInsert: {
          name: seedEnvironment.SEED_ADMIN_NAME,
          email: seedEnvironment.SEED_ADMIN_EMAIL,
          passwordHash,
          role: "ADMIN",
          isActive: true,
        },
      },
      { upsert: true },
    );

    logger.info(
      result.upsertedCount === 1
        ? "First admin account created"
        : "Admin seed skipped because the email already exists",
    );
  } finally {
    await disconnectDatabase();
  }
};

seedAdmin().catch((error: unknown) => {
  logger.fatal({ err: error }, "Admin seed failed");
  process.exitCode = 1;
});
