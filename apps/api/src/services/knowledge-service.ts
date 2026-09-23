import {
  createHybridRetriever,
  searchVectorsInMemory,
  type KnowledgeCandidate,
  type RetrievalResult,
  type RetrieveKnowledge,
  type VectorSearch,
} from "../agents/hybrid-retrieval.js";
import {
  embeddingHash,
  knowledgeEmbeddingText,
  type Embed,
  type EmbeddingSettings,
} from "../agents/openai-embeddings.js";
import { SHOP_KNOWLEDGE_DOCUMENTS, type KnowledgeDocument } from "../agents/shop-knowledge.js";
import { HttpError } from "../middleware/http-error.js";
import type {
  KnowledgeNoteRecord,
  KnowledgeNoteRepository,
} from "../repositories/knowledge-note-repository.js";
import { createSlug } from "../utils/slug.js";
import type {
  CreateKnowledgeNoteInput,
  UpdateKnowledgeNoteInput,
} from "../validation/knowledge-schemas.js";

// CURRENT: embedded from the note's current text. STALE: text or model changed since.
// MISSING: never embedded. DISABLED: embeddings are not configured.
export type EmbeddingStatus = "CURRENT" | "STALE" | "MISSING" | "DISABLED";
export type VectorSearchMode = "memory" | "atlas";

export interface KnowledgeNoteView extends KnowledgeNoteRecord {
  embeddingStatus: EmbeddingStatus;
}

export interface KnowledgeService {
  listNotes(): Promise<KnowledgeNoteView[]>;
  createNote(input: CreateKnowledgeNoteInput, adminId: string): Promise<KnowledgeNoteView>;
  updateNote(
    slug: string,
    input: UpdateKnowledgeNoteInput,
    adminId: string,
  ): Promise<KnowledgeNoteView>;
  embedPending(): Promise<{ embedded: number; tokens: number }>;
  ensureBuiltInNotes(): Promise<number>;
  retrieve: RetrieveKnowledge;
  getStatus(): { embeddings: boolean; vectorSearch: VectorSearchMode; model: string | null };
}

const EMBED_BATCH_SIZE = 100;
const toDocument = ({
  slug,
  title,
  content,
  keywords,
}: KnowledgeNoteRecord): KnowledgeDocument => ({
  id: slug,
  title,
  content,
  keywords,
});

export const createKnowledgeService = ({
  repository,
  embed,
  embedding,
  vectorSearch = "memory",
  minSimilarity,
  builtInNotes = SHOP_KNOWLEDGE_DOCUMENTS,
}: {
  repository: KnowledgeNoteRepository;
  embed?: Embed | undefined;
  embedding: EmbeddingSettings;
  vectorSearch?: VectorSearchMode;
  minSimilarity?: number | undefined;
  builtInNotes?: readonly KnowledgeDocument[];
}): KnowledgeService => {
  const expectedHash = (note: KnowledgeNoteRecord) =>
    embeddingHash(knowledgeEmbeddingText(toDocument(note)), embedding);
  const statusOf = (note: KnowledgeNoteRecord): EmbeddingStatus =>
    !embed
      ? "DISABLED"
      : !note.embeddingHash
        ? "MISSING"
        : note.embeddingHash === expectedHash(note)
          ? "CURRENT"
          : "STALE";
  const view = (note: KnowledgeNoteRecord): KnowledgeNoteView => ({
    ...note,
    embeddingStatus: statusOf(note),
  });

  const embedNotes = async (notes: KnowledgeNoteRecord[]) => {
    if (!embed) return { embedded: 0, tokens: 0 };
    let tokens = 0;
    for (let start = 0; start < notes.length; start += EMBED_BATCH_SIZE) {
      const batch = notes.slice(start, start + EMBED_BATCH_SIZE);
      const result = await embed(batch.map((note) => knowledgeEmbeddingText(toDocument(note))));
      tokens += result.tokens;
      await Promise.all(
        batch.map((note, index) =>
          repository.setEmbedding(note.slug, result.vectors[index]!, expectedHash(note)),
        ),
      );
    }
    return { embedded: notes.length, tokens };
  };

  // Saving a note must succeed even if OpenAI is unavailable. The note stays keyword-searchable
  // and shows as MISSING or STALE until "Embed pending notes" succeeds.
  const embedAfterSave = async (note: KnowledgeNoteRecord): Promise<KnowledgeNoteView> => {
    if (!embed || !note.isActive || statusOf(note) === "CURRENT") return view(note);
    try {
      await embedNotes([note]);
      return {
        ...note,
        embeddingHash: expectedHash(note),
        embeddedAt: new Date(),
        embeddingStatus: "CURRENT",
      };
    } catch {
      return view(note);
    }
  };

  const atlasSearch =
    (currentSlugs: Set<string>): VectorSearch =>
    async (queryVector, _candidates, limit) =>
      (await repository.vectorSearch(queryVector, limit))
        // Atlas also indexes vectors for text that has since changed; ignore those.
        .filter(({ slug }) => currentSlugs.has(slug))
        .map(({ slug, similarity }) => ({ id: slug, similarity }));

  const retrieve: RetrieveKnowledge = async (question): Promise<RetrievalResult> => {
    let candidates: KnowledgeCandidate[];
    let searchVectors: VectorSearch = searchVectorsInMemory;
    if (vectorSearch === "atlas") {
      // Atlas holds the vectors; only text and hashes are loaded here.
      const notes = (await repository.list()).filter(({ isActive }) => isActive);
      candidates = notes.map((note) => ({ ...toDocument(note), embedding: null }));
      searchVectors = atlasSearch(
        new Set(notes.filter((note) => statusOf(note) === "CURRENT").map(({ slug }) => slug)),
      );
    } else {
      const notes = await repository.listActiveWithEmbeddings();
      candidates = notes.map((note) => ({
        ...toDocument(note),
        embedding: note.embedding && statusOf(note) === "CURRENT" ? note.embedding : null,
      }));
    }
    return createHybridRetriever({
      loadCandidates: async () => candidates,
      embed,
      searchVectors,
      ...(minSimilarity === undefined ? {} : { minSimilarity }),
    })(question);
  };

  return {
    async listNotes() {
      return (await repository.list()).map(view);
    },
    async createNote(input, adminId) {
      const slug = createSlug(input.title);
      if (await repository.findBySlug(slug)) {
        throw new HttpError(
          409,
          "KNOWLEDGE_NOTE_EXISTS",
          "A note with a similar title already exists.",
        );
      }
      const note = await repository.create({ ...input, slug, updatedBy: adminId });
      return embedAfterSave(note);
    },
    async updateNote(slug, input, adminId) {
      const note = await repository.update(slug, { ...input, updatedBy: adminId });
      if (!note) throw new HttpError(404, "KNOWLEDGE_NOTE_NOT_FOUND", "That note was not found.");
      return embedAfterSave(note);
    },
    async embedPending() {
      if (!embed) {
        throw new HttpError(503, "EMBEDDINGS_NOT_CONFIGURED", "Embeddings are not configured.");
      }
      const pending = (await repository.list()).filter(
        (note) => note.isActive && statusOf(note) !== "CURRENT",
      );
      try {
        return await embedNotes(pending);
      } catch {
        throw new HttpError(
          503,
          "EMBEDDING_FAILED",
          "Notes could not be embedded. Try again later.",
        );
      }
    },
    ensureBuiltInNotes: () =>
      repository.insertMissing(
        builtInNotes.map(({ id, title, content, keywords }) => ({
          slug: id,
          title,
          content,
          keywords,
          isActive: true,
          updatedBy: null,
        })),
      ),
    retrieve,
    getStatus: () => ({
      embeddings: Boolean(embed),
      vectorSearch,
      model: embed ? embedding.model : null,
    }),
  };
};
