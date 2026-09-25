// Asking how something is done is a question, not a change request; the assistant explains it.
const HOW_TO_QUESTION = /^\s*(how|what|when|why|who|which|where)\b/i;
// Changes the assistant cannot even propose. Stock and availability requests pass through,
// because the model can only turn them into proposals that an admin must approve.
const UNSUPPORTED_CHANGES = [
  /\b(create|place|cancel|delete|archive|update|change|edit|set|mark|confirm|complete|prepare|refund|reset|send|manage)\b.*\b(orders?|prices?|pricing|accounts?|passwords?|messages?|emails?|staff|categor(?:y|ies))\b/i,
  /\b(create|add|delete|archive|remove|rename|restore)\b.*\b(products?|menu items?|categor(?:y|ies))\b/i,
];
const CLAIMED_MUTATION =
  /\b(i|we)\s+(have|just|already)\s+(created|placed|cancelled|deleted|updated|changed|edited|confirmed|completed|sent|managed|marked|restocked|approved|applied)\b/i;
const MAX_ANSWER_CHARACTERS = 4_000;

export const checkShopAssistantQuestion = (
  question: string,
): { allowed: true } | { allowed: false; message: string } =>
  !HOW_TO_QUESTION.test(question) && UNSUPPORTED_CHANGES.some((pattern) => pattern.test(question))
    ? {
        allowed: false,
        message:
          "I can explain the menu, stock, orders, sales and shop procedures, and I can prepare stock or availability changes for you to approve. I cannot change orders, prices, accounts or products directly.",
      }
    : { allowed: true };

export const checkShopAssistantAnswer = (answer: string): string => {
  const trimmed = answer.trim();
  if (!trimmed) throw new Error("The assistant returned an empty answer.");
  if (trimmed.length > MAX_ANSWER_CHARACTERS) {
    throw new Error("The assistant returned an answer that was too long.");
  }
  if (CLAIMED_MUTATION.test(trimmed)) {
    throw new Error("The assistant claimed an unperformed shop change.");
  }
  return trimmed;
};
