import type { Types } from "mongoose";

import { AgentRunModel } from "../models/agent-run-model.js";
import type {
  AgentRunFeedback,
  AgentRunFilters,
  AgentRunRecord,
  NewAgentRun,
} from "../types/agent-run.js";

export interface AgentRunRepository {
  create(run: NewAgentRun): Promise<string>;
  list(filters: AgentRunFilters): Promise<AgentRunRecord[]>;
  setFeedback(
    id: string,
    adminId: string,
    feedback: AgentRunFeedback,
  ): Promise<AgentRunRecord | null>;
}

type StoredAgentRun = NewAgentRun & { _id: Types.ObjectId; feedback: AgentRunFeedback | null };

const toAgentRunRecord = ({ _id, ...run }: StoredAgentRun): AgentRunRecord => ({
  ...run,
  id: _id.toString(),
  feedback: run.feedback ?? null,
});

export class MongooseAgentRunRepository implements AgentRunRepository {
  public async create(run: NewAgentRun): Promise<string> {
    const created = await AgentRunModel.create(run);
    return created._id.toString();
  }

  public async list({ outcome, rating, limit }: AgentRunFilters): Promise<AgentRunRecord[]> {
    const filter: Record<string, unknown> = {};
    if (outcome) filter.outcome = outcome;
    if (rating === "UNRATED") filter.feedback = null;
    else if (rating) filter["feedback.rating"] = rating;

    const runs = await AgentRunModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<StoredAgentRun[]>()
      .exec();
    return runs.map(toAgentRunRecord);
  }

  public async setFeedback(
    id: string,
    adminId: string,
    feedback: AgentRunFeedback,
  ): Promise<AgentRunRecord | null> {
    // Only the admin who asked the question can rate the answer they saw.
    const run = await AgentRunModel.findOneAndUpdate(
      { _id: id, adminId },
      { $set: { feedback } },
      { returnDocument: "after", runValidators: true },
    )
      .lean<StoredAgentRun>()
      .exec();
    return run ? toAgentRunRecord(run) : null;
  }
}
