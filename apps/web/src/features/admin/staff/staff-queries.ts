import { queryOptions } from "@tanstack/react-query";

import { getStaffAccounts, type StaffAccountFilters } from "./staff-api.js";

export const ADMIN_STAFF_ACCOUNTS_QUERY_KEY = ["admin", "staff-accounts"] as const;

export const staffAccountsQuery = (filters: StaffAccountFilters) =>
  queryOptions({
    queryKey: [...ADMIN_STAFF_ACCOUNTS_QUERY_KEY, filters],
    queryFn: ({ signal }) => getStaffAccounts(filters, signal),
  });
