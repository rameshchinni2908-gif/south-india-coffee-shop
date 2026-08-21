import { queryOptions } from "@tanstack/react-query";

import { getAdminOrders } from "./order-api.js";
import type { OrderStatus } from "./order-status.js";

export const ADMIN_ORDERS_QUERY_KEY = ["admin", "orders"] as const;

export const adminOrdersQuery = (filters: {
  page: number;
  search: string;
  status: OrderStatus | "ALL";
}) =>
  queryOptions({
    queryKey: [...ADMIN_ORDERS_QUERY_KEY, filters],
    queryFn: ({ signal }) => getAdminOrders(filters, signal),
    refetchInterval: 30_000,
  });
