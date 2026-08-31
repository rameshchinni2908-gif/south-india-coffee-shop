import "dotenv/config";

import pino from "pino";

import { configureDatabaseDns, connectDatabase, disconnectDatabase } from "../config/database.js";
import { loadEnvironment } from "../config/environment.js";
import { seedCatalog } from "../seeds/catalog-seed.js";

const logger = pino();

const runCatalogSeed = async (): Promise<void> => {
  const environment = loadEnvironment();

  configureDatabaseDns(environment.MONGODB_DNS_SERVERS);
  await connectDatabase(environment.MONGODB_URI);

  try {
    const result = await seedCatalog();
    logger.info(result, "Catalog seed completed");
  } finally {
    await disconnectDatabase();
  }
};

runCatalogSeed().catch((error: unknown) => {
  logger.fatal({ err: error }, "Catalog seed failed");
  process.exitCode = 1;
});
