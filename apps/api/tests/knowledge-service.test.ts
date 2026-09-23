import { describe, expect, it, vi } from "vitest";

import type { Embed } from "../src/agents/openai-embeddings.js";
import type {
  KnowledgeNoteRepository,
  KnowledgeNoteWithEmbedding,
} from "../src/repositories/knowledge-note-repository.js";
import { createKnowledgeService } from "../src/services/knowledge-service.js";

const settings = { model: "fake-embedding", dimensions: 3 };
// A toy embedding with three "topics", so tests can reason about similarity by hand.
const TOPICS = [/hour|open|close|time/i, /pay|upi|cash/i, /allerg|nut|vegan/i];
// A plain function: wrapping a shared mock in vi.fn would share its call history across tests.
const fakeEmbed: Embed = async (texts) => ({
  vectors: texts.map((text) => TOPICS.map((topic) => (topic.test(text) ? 1 : 0.05))),
  tokens: texts.length * 10,
});

const createMemoryRepository = () => {
  const notes = new Map<string, KnowledgeNoteWithEmbedding>();
  let id = 0;
  const strip = ({ embedding: _embedding, ...note }: KnowledgeNoteWithEmbedding) => ({ ...note });
  const repository: KnowledgeNoteRepository & { notes: typeof notes } = {
    notes,
    list: async () => [...notes.values()].map(strip),
    listActiveWithEmbeddings: async () =>
      [...notes.values()].filter(({ isActive }) => isActive).map((note) => ({ ...note })),
    findBySlug: async (slug) => (notes.has(slug) ? strip(notes.get(slug)!) : null),
    create: async (data) => {
      const now = new Date("2026-09-20T00:00:00Z");
      const note: KnowledgeNoteWithEmbedding = {
        ...data,
        id: String((id += 1)),
        embedding: null,
        embeddingHash: null,
        embeddedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      notes.set(data.slug, note);
      return strip(note);
    },
    update: async (slug, data) => {
      const note = notes.get(slug);
      if (!note) return null;
      Object.assign(
        note,
        Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
      );
      return strip(note);
    },
    insertMissing: async (items) => {
      let inserted = 0;
      for (const item of items) {
        if (!notes.has(item.slug)) {
          await repository.create(item);
          inserted += 1;
        }
      }
      return inserted;
    },
    setEmbedding: async (slug, embedding, hash) => {
      Object.assign(notes.get(slug)!, { embedding, embeddingHash: hash, embeddedAt: new Date() });
    },
    vectorSearch: vi.fn<KnowledgeNoteRepository["vectorSearch"]>(),
  };
  return repository;
};

const hoursNote = {
  title: "Opening hours",
  content: "The shop opens at a time the owner has not confirmed yet.",
  keywords: ["hours"],
  isActive: true,
};

describe("knowledge service", () => {
  it("embeds a new note when it is saved and reports it as current", async () => {
    const repository = createMemoryRepository();
    const service = createKnowledgeService({ repository, embed: fakeEmbed, embedding: settings });

    const note = await service.createNote(hoursNote, "admin-1");

    expect(note).toMatchObject({
      slug: "opening-hours",
      updatedBy: "admin-1",
      embeddingStatus: "CURRENT",
    });
    expect(repository.notes.get("opening-hours")?.embedding).toHaveLength(3);
  });

  it("saves the note even when embedding fails, then embeds it later", async () => {
    const repository = createMemoryRepository();
    const embed = vi
      .fn<Embed>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(fakeEmbed);
    const service = createKnowledgeService({ repository, embed, embedding: settings });

    expect(await service.createNote(hoursNote, "admin-1")).toMatchObject({
      embeddingStatus: "MISSING",
    });
    expect(await service.embedPending()).toEqual({ embedded: 1, tokens: 10 });
    expect((await service.listNotes())[0]!.embeddingStatus).toBe("CURRENT");
    expect(await service.embedPending()).toEqual({ embedded: 0, tokens: 0 });
  });

  it("re-embeds only when the embedded text changes", async () => {
    const repository = createMemoryRepository();
    const embed = vi.fn<Embed>(fakeEmbed);
    const service = createKnowledgeService({ repository, embed, embedding: settings });
    await service.createNote(hoursNote, "admin-1");

    await service.updateNote("opening-hours", { isActive: true }, "admin-2");
    expect(embed).toHaveBeenCalledTimes(1);
    await service.updateNote(
      "opening-hours",
      { content: "Opening time is 7 am daily." },
      "admin-2",
    );
    expect(embed).toHaveBeenCalledTimes(2);
  });

  it("never retrieves by a vector that belongs to older text", async () => {
    const repository = createMemoryRepository();
    const service = createKnowledgeService({ repository, embed: fakeEmbed, embedding: settings });
    await service.createNote(hoursNote, "admin-1");
    // Simulate an edit whose re-embedding failed: the stored vector is now stale.
    await repository.update("opening-hours", { content: "Payment is collected at the counter." });

    expect((await service.listNotes())[0]!.embeddingStatus).toBe("STALE");
    const result = await service.retrieve("When do you open?");
    expect(
      result.documents.find(({ document }) => document.id === "opening-hours")?.vector ?? null,
    ).toBeNull();
  });

  it("retrieves a paraphrase by meaning in hybrid mode", async () => {
    const repository = createMemoryRepository();
    const service = createKnowledgeService({ repository, embed: fakeEmbed, embedding: settings });
    await service.createNote(hoursNote, "admin-1");
    await service.createNote(
      {
        ...hoursNote,
        title: "Counter payments",
        content: "UPI and cash acceptance is unconfirmed.",
        keywords: ["payment"],
      },
      "admin-1",
    );

    const result = await service.retrieve("What time can customers come in?");

    expect(result.mode).toBe("hybrid");
    expect(result.documents[0]).toMatchObject({ document: { id: "opening-hours" }, keyword: null });
  });

  it("uses Atlas results only for active notes with current embeddings", async () => {
    const repository = createMemoryRepository();
    const service = createKnowledgeService({
      repository,
      embed: fakeEmbed,
      embedding: settings,
      vectorSearch: "atlas",
    });
    await service.createNote(hoursNote, "admin-1");
    await service.createNote({ ...hoursNote, title: "Old hours", isActive: false }, "admin-1");
    vi.mocked(repository.vectorSearch).mockResolvedValue([
      { slug: "old-hours", similarity: 0.99 },
      { slug: "opening-hours", similarity: 0.8 },
    ]);

    const result = await service.retrieve("When do you open?");

    expect(repository.vectorSearch).toHaveBeenCalledWith(expect.any(Array), 8);
    expect(result.documents.map(({ document }) => document.id)).toEqual(["opening-hours"]);
  });

  it("adds missing built-in notes without overwriting an admin's edits", async () => {
    const repository = createMemoryRepository();
    const builtInNotes = [
      { id: "opening-hours", title: "Built-in", content: "Built-in content text.", keywords: [] },
      { id: "payments", title: "Payments", content: "Built-in payment text.", keywords: [] },
    ];
    const service = createKnowledgeService({ repository, embedding: settings, builtInNotes });
    await service.createNote(hoursNote, "admin-1");

    expect(await service.ensureBuiltInNotes()).toBe(1);
    expect(repository.notes.get("opening-hours")?.title).toBe("Opening hours");
    expect(await service.ensureBuiltInNotes()).toBe(0);
  });

  it("reports duplicate titles, unknown notes and missing configuration clearly", async () => {
    const service = createKnowledgeService({
      repository: createMemoryRepository(),
      embedding: settings,
    });
    await service.createNote(hoursNote, "admin-1");

    await expect(
      service.createNote({ ...hoursNote, title: "Opening Hours!" }, "a"),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(service.updateNote("missing", { isActive: false }, "a")).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.embedPending()).rejects.toMatchObject({
      code: "EMBEDDINGS_NOT_CONFIGURED",
    });
    expect((await service.listNotes())[0]!.embeddingStatus).toBe("DISABLED");
    expect(service.getStatus()).toEqual({ embeddings: false, vectorSearch: "memory", model: null });
  });
});
