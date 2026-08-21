import type { DatabaseState } from "../config/database.js";

export interface HealthData {
  status: "ok" | "unavailable";
  database: DatabaseState;
  timestamp: string;
}

export const getHealthData = (database: DatabaseState): HealthData => ({
  status: database === "connected" ? "ok" : "unavailable",
  database,
  timestamp: new Date().toISOString(),
});
