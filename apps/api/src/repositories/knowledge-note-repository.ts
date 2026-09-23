import type { Types } from "mongoose";

import { KNOWLEDGE_VECTOR_INDEX, KnowledgeNoteModel } from "../models/knowledge-note-model.js";

export interface KnowledgeNoteRecord {
  id: string;
  slug: string;
  title: string;
  content: string;
  keywords: string[];
  isActive: boolean;
  embeddingHash: string | null;
  embeddedAt: Date | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeNoteWithEmbedding extends KnowledgeNoteRecord {
  embedding: number[] | null;
}

export interface KnowledgeNoteWriteData {
  title: string;
  content: string;
  keywords: string[];
  isActive: boolean;
  updatedBy: string | null;
}

export type KnowledgeNoteUpdateData = {
  [Key in keyof KnowledgeNoteWriteData]?: KnowledgeNoteWriteData[Key] | undefined;
};

export interface KnowledgeNoteRepository {
  list(): Promise<KnowledgeNoteRecord[]>;
  listActiveWithEmbeddings(): Promise<KnowledgeNoteWithEmbedding[]>;
  findBySlug(slug: string): Promise<KnowledgeNoteRecord | null>;
  create(data: KnowledgeNoteWriteData & { slug: string }): Promise<KnowledgeNoteRecord>;
  update(slug: string, data: KnowledgeNoteUpdateData): Promise<KnowledgeNoteRecord | null>;
  // Inserts notes whose slug does not exist yet; never overwrites an admin's edits.
  insertMissing(notes: (KnowledgeNoteWriteData & { slug: string })[]): Promise<number>;
  setEmbedding(slug: string, embedding: number[], hash: string): Promise<void>;
  // Atlas Vector Search. Scores are converted to cosine similarity.
  vectorSearch(
    queryVector: readonly number[],
    limit: number,
  ): Promise<{ slug: string; similarity: number }[]>;
}

type StoredNote = Omit<KnowledgeNoteWithEmbedding, "id" | "embedding"> & {
  _id: Types.ObjectId;
  embedding?: number[];
};

const toRecord = ({ _id, embedding: _embedding, ...note }: StoredNote): KnowledgeNoteRecord => ({
  ...note,
  id: _id.toString(),
  keywords: note.keywords ?? [],
  embeddingHash: note.embeddingHash ?? null,
  embeddedAt: note.embeddedAt ?? null,
  updatedBy: note.updatedBy ?? null,
});

export class MongooseKnowledgeNoteRepository implements KnowledgeNoteRepository {
  public async list(): Promise<KnowledgeNoteRecord[]> {
    const notes = await KnowledgeNoteModel.find().sort({ title: 1 }).lean<StoredNote[]>().exec();
    return notes.map(toRecord);
  }

  public async listActiveWithEmbeddings(): Promise<KnowledgeNoteWithEmbedding[]> {
    const notes = await KnowledgeNoteModel.find({ isActive: true })
      .select("+embedding")
      .sort({ createdAt: 1 })
      .lean<StoredNote[]>()
      .exec();
    return notes.map((note) => ({ ...toRecord(note), embedding: note.embedding ?? null }));
  }

  public async findBySlug(slug: string): Promise<KnowledgeNoteRecord | null> {
    const note = await KnowledgeNoteModel.findOne({ slug }).lean<StoredNote>().exec();
    return note ? toRecord(note) : null;
  }

  public async create(data: KnowledgeNoteWriteData & { slug: string }) {
    const note = await KnowledgeNoteModel.create(data);
    return toRecord(note.toObject() as StoredNote);
  }

  public async update(slug: string, data: KnowledgeNoteUpdateData) {
    // Absent fields stay unchanged rather than being cleared.
    const changes = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
    const note = await KnowledgeNoteModel.findOneAndUpdate(
      { slug },
      { $set: changes },
      { returnDocument: "after", runValidators: true },
    )
      .lean<StoredNote>()
      .exec();
    return note ? toRecord(note) : null;
  }

  public async insertMissing(notes: (KnowledgeNoteWriteData & { slug: string })[]) {
    if (notes.length === 0) return 0;
    const result = await KnowledgeNoteModel.bulkWrite(
      notes.map((note) => ({
        updateOne: { filter: { slug: note.slug }, update: { $setOnInsert: note }, upsert: true },
      })),
    );
    return result.upsertedCount;
  }

  public async setEmbedding(slug: string, embedding: number[], hash: string) {
    await KnowledgeNoteModel.updateOne(
      { slug },
      // Timestamps stay unchanged: embedding is maintenance, not an edit to the note.
      { $set: { embedding, embeddingHash: hash, embeddedAt: new Date() } },
      { timestamps: false },
    ).exec();
  }

  public async vectorSearch(queryVector: readonly number[], limit: number) {
    const matches = await KnowledgeNoteModel.aggregate<{ slug: string; score: number }>([
      {
        $vectorSearch: {
          index: KNOWLEDGE_VECTOR_INDEX,
          path: "embedding",
          queryVector: [...queryVector],
          // Approximate search examines this many neighbours before returning `limit`.
          numCandidates: Math.max(limit * 10, 50),
          limit,
          filter: { isActive: true },
        },
      },
      { $project: { _id: 0, slug: 1, score: { $meta: "vectorSearchScore" } } },
    ]).exec();
    // Atlas normalises cosine scores to 0..1 as (1 + cosine) / 2; convert back.
    return matches.map(({ slug, score }) => ({ slug, similarity: score * 2 - 1 }));
  }
}
