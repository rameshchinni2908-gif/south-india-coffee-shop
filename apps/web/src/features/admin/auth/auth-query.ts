import { queryOptions } from "@tanstack/react-query";

import { getCurrentUser } from "./auth-api.js";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

export const currentUserQuery = queryOptions({
  queryKey: AUTH_QUERY_KEY,
  queryFn: ({ signal }) => getCurrentUser(signal),
  staleTime: 60_000,
  retry: false,
});
