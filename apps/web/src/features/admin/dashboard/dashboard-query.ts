import { queryOptions } from "@tanstack/react-query";

import { getDashboardSummary } from "./dashboard-api.js";

export const DASHBOARD_QUERY_KEY = ["admin", "dashboard"] as const;

export const dashboardQuery = queryOptions({
  queryKey: DASHBOARD_QUERY_KEY,
  queryFn: ({ signal }) => getDashboardSummary(signal),
  refetchInterval: 60_000,
});
