import type { ArenaResult } from "./arena-contract.js";
import { ArenaResultModel } from "./arena-result-model.js";
import type { NewArenaResultRecord } from "./arena-types.js";

export interface ArenaResultRepository {
  create(result: NewArenaResultRecord): Promise<ArenaResult>;
  findLatestByRoomCode(roomCode: string): Promise<ArenaResult | null>;
}

const toArenaResult = (result: InstanceType<typeof ArenaResultModel>): ArenaResult => ({
  roomCode: result.roomCode,
  arenaId: result.arenaId,
  finishedAt: result.finishedAt.toISOString(),
  standings: result.standings.map((standing) => ({
    badgeNumber: standing.badgeNumber,
    colour: standing.colour,
    emoji: standing.emoji ?? null,
    rank: standing.rank,
    hits: standing.hits,
    taken: standing.taken,
    downs: standing.downs,
    disconnected: standing.disconnected,
    suspect: standing.suspect,
  })),
  payerBadgeNumber: result.payerBadgeNumber,
});

export class MongooseArenaResultRepository implements ArenaResultRepository {
  public async create(result: NewArenaResultRecord): Promise<ArenaResult> {
    const createdResult = await ArenaResultModel.create({
      roomCode: result.roomCode,
      arenaId: result.arenaId,
      finishedAt: result.finishedAt,
      standings: result.standings.map((standing) => ({ ...standing })),
      payerBadgeNumber: result.payerBadgeNumber,
      expiresAt: result.expiresAt,
    });

    return toArenaResult(createdResult);
  }

  public async findLatestByRoomCode(roomCode: string): Promise<ArenaResult | null> {
    const result = await ArenaResultModel.findOne({ roomCode }).sort({ finishedAt: -1 }).exec();

    return result ? toArenaResult(result) : null;
  }
}
