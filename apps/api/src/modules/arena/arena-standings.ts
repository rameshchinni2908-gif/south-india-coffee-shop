import type { ArenaStanding, BadgeColourId } from "./arena-contract.js";

/**
 * Pure ranking and payer selection.
 *
 * Nothing here touches rooms, sockets, timers or the database, so the rules
 * from BEAN-BLASTERS.md §11 can be unit-tested on their own.
 */

export interface ArenaRankingEntry {
  readonly badgeNumber: number;
  readonly colour: BadgeColourId;
  readonly emoji: string | null;
  /** Splashes landed. The primary score. */
  readonly hits: number;
  /** Splashes taken. Tiebreak — fewer is better. */
  readonly taken: number;
  readonly downs: number;
  readonly disconnected: boolean;
  readonly suspect: boolean;
}

export interface ArenaOutcome {
  readonly standings: readonly ArenaStanding[];
  readonly payerBadgeNumber: number;
}

/**
 * Most splashes landed wins; a tie goes to whoever took fewer; a remaining tie
 * goes to the lower badge number, so the same field always ranks the same way.
 * A disconnected player is ranked on what they actually scored — leaving early
 * neither rescues you from last place nor drops you into it.
 */
const compareEntries = (first: ArenaRankingEntry, second: ArenaRankingEntry): number => {
  if (first.hits !== second.hits) {
    return second.hits - first.hits;
  }

  if (first.taken !== second.taken) {
    return first.taken - second.taken;
  }

  return first.badgeNumber - second.badgeNumber;
};

export const buildArenaStandings = (entries: readonly ArenaRankingEntry[]): ArenaStanding[] =>
  [...entries].sort(compareEntries).map((entry, index) => ({
    badgeNumber: entry.badgeNumber,
    colour: entry.colour,
    emoji: entry.emoji,
    rank: index + 1,
    hits: entry.hits,
    taken: entry.taken,
    downs: entry.downs,
    disconnected: entry.disconnected,
    suspect: entry.suspect,
  }));

/** Last place buys the coffee. A suggestion only, never a payment instruction. */
export const findPayerBadgeNumber = (standings: readonly ArenaStanding[]): number =>
  standings.at(-1)?.badgeNumber ?? 0;

export const buildArenaOutcome = (entries: readonly ArenaRankingEntry[]): ArenaOutcome => {
  const standings = buildArenaStandings(entries);

  return { standings, payerBadgeNumber: findPayerBadgeNumber(standings) };
};
