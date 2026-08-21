import { apiPost } from "../../lib/api-client.js";
import type { Order } from "../../types/order.js";

export interface CreateOrderRequest {
  customerName: string;
  customerMobile: string;
  items: Array<{ productId: string; variantId: string; quantity: number }>;
  pickupTime: string;
  notes: string;
}

export const createOrder = async (request: CreateOrderRequest): Promise<Order> => {
  const response = await apiPost<{ order: Order }, CreateOrderRequest>("/api/orders", request);

  return response.data.order;
};
