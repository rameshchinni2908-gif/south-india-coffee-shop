import type { Order } from "../../types/order.js";

const confirmationKey = (orderNumber: string) => `order-confirmation:${orderNumber}`;

export const saveOrderConfirmation = (order: Order): void => {
  window.sessionStorage.setItem(confirmationKey(order.orderNumber), JSON.stringify(order));
};

export const readOrderConfirmation = (orderNumber: string): Order | null => {
  try {
    const value = window.sessionStorage.getItem(confirmationKey(orderNumber));

    return value ? (JSON.parse(value) as Order) : null;
  } catch {
    return null;
  }
};
