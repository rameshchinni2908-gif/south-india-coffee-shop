import type { RaceResult } from "./game-contract.js";
import { GameResultModel } from "./game-result-model.js";
import type { NewGameResultRecord } from "./game-types.js";

export interface GameResultRepository {
  create(result: NewGameResultRecord): Promise<RaceResult>;
  findLatestByRoomCode(roomCode: string): Promise<RaceResult | null>;
}

const toRaceResult = (result: InstanceType<typeof GameResultModel>): RaceResult => ({
  roomCode: result.roomCode,
  trackId: result.trackId,
  finishedAt: result.finishedAt.toISOString(),
  standings: result.standings.map((standing) => ({
    carNumber: standing.carNumber,
    colour: standing.colour,
    emoji: standing.emoji ?? null,
    rank: standing.rank,
    finishMs: standing.finishMs ?? null,
    lapsCompleted: standing.lapsCompleted,
    progress: standing.progress,
    disconnected: standing.disconnected,
    suspect: standing.suspect,
  })),
  payerCarNumber: result.payerCarNumber,
});

export class MongooseGameResultRepository implements GameResultRepository {
  public async create(result: NewGameResultRecord): Promise<RaceResult> {
    const createdResult = await GameResultModel.create({
      roomCode: result.roomCode,
      trackId: result.trackId,
      finishedAt: result.finishedAt,
      standings: result.standings.map((standing) => ({ ...standing })),
      payerCarNumber: result.payerCarNumber,
      expiresAt: result.expiresAt,
    });

    return toRaceResult(createdResult);
  }

  public async findLatestByRoomCode(roomCode: string): Promise<RaceResult | null> {
    const result = await GameResultModel.findOne({ roomCode }).sort({ finishedAt: -1 }).exec();

    return result ? toRaceResult(result) : null;
  }
}
