import "dotenv/config";

import pino from "pino";

import { configureDatabaseDns, connectDatabase, disconnectDatabase } from "../config/database.js";
import { loadEnvironment } from "../config/environment.js";
import { KNOWLEDGE_VECTOR_INDEX, KnowledgeNoteModel } from "../models/knowledge-note-model.js";

const logger = pino();

// Creates the Atlas Vector Search index used when KNOWLEDGE_VECTOR_SEARCH=atlas.
// Atlas only: community MongoDB (including the Docker image) has no $vectorSearch.
const createKnowledgeIndex = async (): Promise<void> => {
  const environment = loadEnvironment();
  configureDatabaseDns(environment.MONGODB_DNS_SERVERS);
  await connectDatabase(environment.MONGODB_URI);

  try {
    await KnowledgeNoteModel.createCollection();
    const collection = KnowledgeNoteModel.collection;
    const existing = await collection.listSearchIndexes(KNOWLEDGE_VECTOR_INDEX).toArray();
    if (existing.length > 0) {
      logger.info({ index: KNOWLEDGE_VECTOR_INDEX, existing }, "Vector index already exists");
      return;
    }
    await collection.createSearchIndex({
      name: KNOWLEDGE_VECTOR_INDEX,
      type: "vectorSearch",
      definition: {
        fields: [
          {
            type: "vector",
            path: "embedding",
            // Must equal OPENAI_EMBEDDING_DIMENSIONS; changing it means dropping this index.
            numDimensions: environment.OPENAI_EMBEDDING_DIMENSIONS,
            similarity: "cosine",
          },
          // Lets $vectorSearch skip archived notes before ranking.
          { type: "filter", path: "isActive" },
        ],
      },
    });
    logger.info(
      { index: KNOWLEDGE_VECTOR_INDEX, dimensions: environment.OPENAI_EMBEDDING_DIMENSIONS },
      "Vector index requested; Atlas builds it in the background (usually under a minute)",
    );
  } finally {
    await disconnectDatabase();
  }
};

createKnowledgeIndex().catch((error: unknown) => {
  logger.fatal({ err: error }, "Vector index creation failed");
  process.exitCode = 1;
});
