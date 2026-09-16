const MUTATING_REQUEST =
  /\b(create|place|cancel|delete|archive|update|change|edit|add|remove|confirm|complete|prepare|send|manage|reset)\b.*\b(order|product|menu|stock|price|account|password|message|email)\b/i;
const CLAIMED_MUTATION =
  /\b(i|we)\s+(have|just|already)\s+(created|placed|cancelled|deleted|updated|changed|edited|confirmed|completed|sent|managed)\b/i;
const MAX_ANSWER_CHARACTERS = 4_000;

export const checkShopAssistantQuestion = (
  question: string,
): { allowed: true } | { allowed: false; message: string } =>
  MUTATING_REQUEST.test(question)
    ? {
        allowed: false,
        message:
          "I’m a read-only shop assistant. I can explain menu, stock, orders, sales and documented procedures, but I cannot change records or place orders.",
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
