import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { connection } from "mongoose";

// Paused plans nobody answers are removed after a week of inactivity.
export const RESTOCK_PLAN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * LangGraph's MongoDB checkpointer on the app's existing Mongoose connection.
 *
 * The package is typed against MongoDB driver 6 while Mongoose 9 uses driver 7. It only uses
 * db(), collection(), find/sort/limit/toArray, updateOne, bulkWrite, deleteMany, createIndex
 * and appendMetadata, which driver 7 keeps, so the client is passed across that type boundary.
 */
export const createRestockCheckpointer = async (): Promise<MongoDBSaver> => {
  const client = connection.getClient() as unknown as ConstructorParameters<
    typeof MongoDBSaver
  >[0]["client"];
  const saver = new MongoDBSaver({
    client,
    // The database named in MONGODB_URI, the same one the rest of the app uses.
    dbName: connection.name,
    checkpointCollectionName: "restock_plan_checkpoints",
    checkpointWritesCollectionName: "restock_plan_checkpoint_writes",
    ttl: RESTOCK_PLAN_TTL_SECONDS,
  });
  // Creates the lookup and TTL indexes; safe to run on every start.
  await saver.setup();
  return saver;
};
