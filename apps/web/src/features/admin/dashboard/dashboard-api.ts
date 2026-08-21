import { apiGet } from "../../../lib/api-client.js";
import type { DashboardSummary } from "../../../types/report.js";

export const getDashboardSummary = async (signal?: AbortSignal): Promise<DashboardSummary> => {
  const response = await apiGet<{ summary: DashboardSummary }>(
    "/api/admin/reports/summary",
    signal,
  );

  return response.data.summary;
};
