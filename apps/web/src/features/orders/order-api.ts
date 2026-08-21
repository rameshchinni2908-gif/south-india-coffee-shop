import { apiGet, apiPatch, apiPost } from "../../lib/api-client.js";
import type { PaginationMeta } from "../../types/api.js";
import type { Order } from "../../types/order.js";
import type { OrderStatus } from "./order-status.js";

export const getAdminOrders = async (
  filters: { page: number; search: string; status: OrderStatus | "ALL" },
  signal?: AbortSignal,
): Promise<{ orders: Order[]; meta: PaginationMeta }> => {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: "20",
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  if (filters.search) {
    params.set("search", filters.search);
  }
  if (filters.status !== "ALL") {
    params.set("status", filters.status);
  }

  const response = await apiGet<{ orders: Order[] }, PaginationMeta>(
    `/api/admin/orders?${params.toString()}`,
    signal,
  );

  return { orders: response.data.orders, meta: response.meta };
};

export const updateOrderStatus = async (request: {
  id: string;
  status: OrderStatus;
}): Promise<Order> => {
  const response = await apiPatch<{ order: Order }, { status: OrderStatus }>(
    `/api/admin/orders/${request.id}/status`,
    { status: request.status },
  );

  return response.data.order;
};

export const trackOrder = async (request: {
  orderNumber: string;
  customerMobile: string;
}): Promise<Order> => {
  const response = await apiPost<{ order: Order }, { orderNumber: string; customerMobile: string }>(
    "/api/orders/track",
    request,
  );

  return response.data.order;
};
