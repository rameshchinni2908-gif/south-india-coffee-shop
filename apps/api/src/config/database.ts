import { setServers } from "node:dns";

import mongoose from "mongoose";

export const DATABASE_STATES = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
} as const;

export type DatabaseState = (typeof DATABASE_STATES)[keyof typeof DATABASE_STATES] | "unknown";

export const getDatabaseState = (): DatabaseState =>
  DATABASE_STATES[mongoose.connection.readyState as keyof typeof DATABASE_STATES] ?? "unknown";

export const configureDatabaseDns = (servers: string[]): void => {
  if (servers.length > 0) {
    setServers(servers);
  }
};

export const connectDatabase = async (mongodbUri: string): Promise<void> => {
  await mongoose.connect(mongodbUri, {
    serverSelectionTimeoutMS: 10_000,
  });
};

export const disconnectDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};
