import { SHOP_KNOWLEDGE_DOCUMENTS, type KnowledgeDocument } from "./shop-knowledge.js";

const MAX_RESULTS = 4;
const MINIMUM_SCORE = 4;
const STOP_WORDS = new Set(
  "a an and are as at be can could do does for from have how i in is it me my of on or our please should tell that the their them there these they this to us we what when which who why will with would you your".split(
    " ",
  ),
);

const SYNONYMS: Readonly<Record<string, string>> = {
  orders: "order",
  ordered: "order",
  ordering: "order",
  pays: "payment",
  pay: "payment",
  paid: "payment",
  payments: "payment",
  tracking: "track",
  tracked: "track",
  progress: "track",
  cancelled: "cancel",
  canceled: "cancel",
  cancelling: "cancel",
  canceling: "cancel",
  cancellation: "cancel",
  confirmed: "confirm",
  confirming: "confirm",
  confirmation: "confirm",
  preparing: "prepare",
  completed: "complete",
  completing: "complete",
  completion: "complete",
  inventory: "stock",
  stocks: "stock",
  restocking: "restock",
  replenish: "restock",
  refill: "restock",
  prices: "price",
  pricing: "price",
  products: "product",
  items: "product",
  item: "product",
  categories: "category",
  variants: "variant",
  sizes: "size",
  quantities: "quantity",
  employees: "staff",
  employee: "staff",
  colleagues: "staff",
  administrators: "admin",
  administrator: "admin",
  permissions: "permission",
  roles: "role",
  accounts: "account",
  revenue: "sales",
  reports: "report",
  thresholds: "threshold",
  refunds: "refund",
  allergies: "allergen",
  allergy: "allergen",
  allergens: "allergen",
  ingredients: "ingredient",
  nuts: "nut",
};

const tokenize = (text: string): Set<string> => {
  const normalized = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\b(?:pick[ -]?up|take[ -]?away|take[ -]?out)\b/g, "pickup")
    .replace(/\b(?:sold[ -]?out|out of stock)\b/g, "soldout")
    .replace(/\b(?:sign[ -]?in|log[ -]?in)\b/g, "login");
  return new Set(
    (normalized.match(/[a-z0-9]+/g) ?? [])
      .filter((term) => term.length > 1 && !STOP_WORDS.has(term))
      .map((term) => SYNONYMS[term] ?? term),
  );
};

export interface RankedKnowledgeDocument {
  document: KnowledgeDocument;
  score: number;
}

// Scores are exposed for the agent run log and retrieval evals; the agent only needs documents.
export const rankShopKnowledge = (
  question: string,
  documents: readonly KnowledgeDocument[] = SHOP_KNOWLEDGE_DOCUMENTS,
  limit = MAX_RESULTS,
): RankedKnowledgeDocument[] => {
  const terms = tokenize(question.slice(0, 2_000));
  if (terms.size === 0) return [];

  return documents
    .map((document, position) => {
      const title = tokenize(document.title);
      const keywords = tokenize(document.keywords.join(" "));
      const content = tokenize(document.content);
      let score = 0;
      for (const term of terms) {
        // Curated keywords and titles count more than incidental words in a paragraph.
        if (keywords.has(term)) score += 6;
        if (title.has(term)) score += 4;
        if (content.has(term)) score += 1;
      }
      return { document, position, score };
    })
    .filter(({ score }) => score >= MINIMUM_SCORE)
    .sort((left, right) => right.score - left.score || left.position - right.position)
    .slice(0, limit)
    .map(({ document, score }) => ({ document, score }));
};

export const retrieveShopKnowledge = (
  question: string,
  documents: readonly KnowledgeDocument[] = SHOP_KNOWLEDGE_DOCUMENTS,
): KnowledgeDocument[] => rankShopKnowledge(question, documents).map(({ document }) => document);
