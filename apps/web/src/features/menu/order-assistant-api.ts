import { apiPost } from "../../lib/api-client.js";

export type OrderDraftLineStatus = "READY" | "CHOOSE_SIZE" | "SOLD_OUT" | "LIMITED";

export interface OrderDraftLine {
  id: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  quantity: number;
  status: OrderDraftLineStatus;
  sizeOptions: { variantId: string; name: string }[];
  message: string | null;
}

export interface OrderDraft {
  lines: OrderDraftLine[];
  notFound: string[];
}

export const draftOrderFromMessage = async (message: string): Promise<OrderDraft> =>
  (
    await apiPost<{ draft: OrderDraft }, { message: string }>("/api/order-assistant/draft", {
      message,
    })
  ).data.draft;
