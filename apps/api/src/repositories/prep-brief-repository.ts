import { PrepBriefModel } from "../models/prep-brief-model.js";
import type { PrepForecast } from "../services/prep-forecast.js";

export interface PrepBriefRecord {
  date: string;
  forecast: PrepForecast;
  narrative: string | null;
  narrativeStatus: "WRITTEN" | "SKIPPED" | "REJECTED" | "FAILED";
  model: string | null;
  generatedAt: Date;
}

export interface PrepBriefRepository {
  findByDate(date: string): Promise<PrepBriefRecord | null>;
  // Replaces the brief for that date (a regenerate overwrites the earlier one).
  save(brief: PrepBriefRecord): Promise<PrepBriefRecord>;
}

type StoredBrief = PrepBriefRecord & { _id: unknown };
const toRecord = ({ _id: _id, ...brief }: StoredBrief): PrepBriefRecord => brief;

export class MongoosePrepBriefRepository implements PrepBriefRepository {
  public async findByDate(date: string) {
    const brief = await PrepBriefModel.findOne({ date }).lean<StoredBrief>().exec();
    return brief ? toRecord(brief) : null;
  }

  public async save(brief: PrepBriefRecord) {
    const saved = await PrepBriefModel.findOneAndUpdate(
      { date: brief.date },
      { $set: brief },
      { upsert: true, returnDocument: "after" },
    )
      .lean<StoredBrief>()
      .exec();
    return toRecord(saved!);
  }
}
