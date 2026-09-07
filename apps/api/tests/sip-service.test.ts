import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { createSipService } from "../src/modules/secret-sip/sip-service.js";
import { SIP_TIMING } from "../src/modules/secret-sip/sip-contract.js";

const table = (size = 3) => {
  let time = 1_000_000;
  const service = createSipService({ ttlMinutes: 60, now: () => time, pick: () => 0 });
  const host = service.create();
  const seats = [host, ...Array.from({ length: size - 1 }, () => service.join(host.code))];
  seats.forEach((s) => service.connect(s.code, s.token));
  const state = (i = 0) => service.state(host.code, seats[i]!.token);
  const act = (i: number, action: Parameters<typeof service.act>[2]) =>
    service.act(host.code, seats[i]!.token, action);
  const advance = (ms: number) => {
    time += ms;
    service.tick();
  };
  const start = () => {
    seats.forEach((_, i) => act(i, { type: "ready", round: state().round, ready: true }));
    act(0, { type: "start", round: state().round });
  };
  const votePhase = () => {
    start();
    advance(SIP_TIMING.reveal);
    for (let i = 0; i < size; i++) advance(SIP_TIMING.clue);
    advance(SIP_TIMING.discuss);
  };
  return { service, seats, host, state, act, advance, start, votePhase };
};
describe("Secret Sip service", () => {
  it("preserves a refreshing player's seat and score across rematch", () => {
    const t = table();
    t.votePhase();
    t.advance(SIP_TIMING.vote);
    t.service.disconnect(t.host.code, t.seats[1]!.token);
    t.act(0, { type: "rematch", round: 1 });
    t.service.connect(t.host.code, t.seats[1]!.token);
    expect(t.state(1).phase).toBe("LOBBY");
    expect(t.state(1).youId).toBe(t.state().players[1]!.id);
    expect(t.state().players).toHaveLength(3);
  });
  it("lets only the host release disconnected lobby seats", () => {
    const t = table();
    const id = t.state(2).youId;
    expect(() => t.act(0, { type: "remove", round: 0, targetId: id })).toThrow("disconnected");
    t.service.disconnect(t.host.code, t.seats[2]!.token);
    expect(() => t.act(1, { type: "remove", round: 0, targetId: id })).toThrow("host");
    t.act(0, { type: "remove", round: 0, targetId: id });
    expect(t.state().players).toHaveLength(2);
    expect(() => t.state(2)).toThrow("original phone");
    const replacement = t.service.join(t.host.code);
    expect(t.service.state(replacement.code, replacement.token).players[2]!.seat).toBe(3);
  });
  it("keeps the frontend and backend contract identical", () => {
    const source = readFileSync(
      new URL("../src/modules/secret-sip/sip-contract.ts", import.meta.url),
      "utf8",
    );
    expect(
      readFileSync(
        new URL("../../web/src/features/secret-sip/sip-contract.ts", import.meta.url),
        "utf8",
      ),
    ).toBe(source);
  });
  it("caps rooms at eight and authenticates every private snapshot", () => {
    const t = table(8);
    expect(() => t.service.join(t.host.code)).toThrow("eight");
    expect(() => t.service.state(t.host.code, t.state().players[1]!.id)).toThrow("original phone");
    expect(t.state().word).toBeNull();
    expect(JSON.stringify(t.state())).not.toContain(t.seats[1]!.token);
  });
  it("requires three connected ready players and host authority", () => {
    const t = table(2);
    expect(t.start).toThrow("three");
    expect(() => t.act(1, { type: "start", round: 0 })).toThrow("host");
    const u = table();
    u.act(0, { type: "ready", round: 0, ready: true });
    expect(() => u.act(0, { type: "start", round: 0 })).toThrow("ready");
  });
  it("projects exactly one bluffer, with no answer or other identities leaked", () => {
    const t = table();
    t.start();
    expect(t.state().role).toBe("BLUFFER");
    expect(t.state().word).toBeNull();
    expect(t.state(1).role).toBe("REGULAR");
    expect(t.state(1).word).toBe("Filter coffee");
    expect(t.state(1).word).toBe(t.state(2).word);
    expect(JSON.stringify(t.state())).not.toContain("Filter coffee");
    expect(t.state().players.every((p) => !("token" in p) && !("role" in p))).toBe(true);
    expect(() => t.service.join(t.host.code)).toThrow("progress");
  });
  it("rejects stale commands and off-turn clue advances", () => {
    const t = table();
    t.start();
    expect(() => t.act(0, { type: "clue", round: 0 })).toThrow("round changed");
    expect(() => t.act(0, { type: "clue", round: 1 })).toThrow("phase");
    t.advance(SIP_TIMING.reveal);
    expect(() => t.act(1, { type: "clue", round: 1 })).toThrow("turn");
    t.act(0, { type: "clue", round: 1 });
    expect(t.state().turnId).toBe(t.state(1).youId);
  });
  it("locks private votes, rejects self votes, then lets a caught bluffer guess", () => {
    const t = table();
    t.votePhase();
    expect(() => t.act(0, { type: "vote", round: 1, targetId: t.state().youId })).toThrow(
      "another",
    );
    t.act(0, { type: "vote", round: 1, targetId: t.state(1).youId });
    expect(() => t.act(0, { type: "vote", round: 1, targetId: t.state(2).youId })).toThrow(
      "locked",
    );
    expect(t.state(1).yourVote).toBeNull();
    expect(t.state(1).result).toBeNull();
    t.act(1, { type: "vote", round: 1, targetId: t.state().youId });
    t.act(2, { type: "vote", round: 1, targetId: t.state().youId });
    expect(t.state().phase).toBe("GUESS");
    expect(() => t.act(1, { type: "guess", round: 1, word: "coffee" })).toThrow("bluffer");
    t.act(0, { type: "guess", round: 1, word: "KAAPI" });
    expect(t.state().result?.reason).toBe("GUESSED");
    expect(t.state().players[0]!.score).toBe(3);
    expect(() => t.act(0, { type: "guess", round: 1, word: "KAAPI" })).toThrow("phase");
    expect(t.state().players[0]!.score).toBe(3);
  });
  it("awards the table for a wrong or timed-out guess", () => {
    for (const timeout of [false, true]) {
      const t = table();
      t.votePhase();
      t.act(1, { type: "vote", round: 1, targetId: t.state().youId });
      t.act(2, { type: "vote", round: 1, targetId: t.state().youId });
      t.advance(SIP_TIMING.vote);
      if (timeout) t.advance(SIP_TIMING.guess);
      else t.act(0, { type: "guess", round: 1, word: "dosa" });
      expect(t.state().result?.winner).toBe("TABLE");
      expect(t.state().players.map((p) => p.score)).toEqual([0, 2, 2]);
    }
  });
  it("resolves ties, abstentions and wrong accusations without getting stuck", () => {
    const t = table();
    t.votePhase();
    t.act(0, { type: "vote", round: 1, targetId: t.state(1).youId });
    t.act(1, { type: "vote", round: 1, targetId: t.state(2).youId });
    t.act(2, { type: "vote", round: 1, targetId: t.state().youId });
    expect(t.state().result?.reason).toBe("TIE");
    const u = table();
    u.votePhase();
    u.advance(SIP_TIMING.vote);
    expect(u.state().result?.reason).toBe("TIE");
    const v = table();
    v.votePhase();
    v.act(0, { type: "vote", round: 1, targetId: v.state(1).youId });
    v.act(2, { type: "vote", round: 1, targetId: v.state(1).youId });
    v.advance(SIP_TIMING.vote);
    expect(v.state().result?.reason).toBe("ESCAPED");
  });
  it("reconnects privately, handles duplicate connections, and migrates the host", () => {
    const t = table();
    t.start();
    const before = t.state();
    t.service.connect(t.host.code, t.host.token);
    t.service.disconnect(t.host.code, t.host.token);
    expect(t.state().players[0]!.connected).toBe(true);
    t.service.disconnect(t.host.code, t.host.token);
    expect(t.state().hostId).toBe(t.state(1).youId);
    t.service.connect(t.host.code, t.host.token);
    expect(t.state().role).toBe(before.role);
    expect(t.state().round).toBe(before.round);
  });
  it("rematches preserve scores but rotate roles and avoid repeated words", () => {
    const t = table();
    t.votePhase();
    t.advance(SIP_TIMING.vote);
    const word = t.state().result?.word;
    t.act(0, { type: "rematch", round: 1 });
    expect(t.state().phase).toBe("LOBBY");
    expect(t.state().players.every((p) => !p.ready)).toBe(true);
    t.start();
    expect(t.state().role).toBe("REGULAR");
    expect(t.state().word).not.toBe(word);
    expect(t.state().players[0]!.score).toBe(3);
  });
  it("expires rooms, releases seats, and rejects actions after expiry", () => {
    const t = table();
    t.act(0, { type: "leave", round: 0 });
    expect(t.state(1).hostId).toBe(t.state(1).youId);
    expect(() => t.state()).toThrow("original phone");
    t.advance(60 * 60_000);
    expect(() => t.state(1)).toThrow("closed");
    expect(() => t.service.join(t.host.code)).toThrow("closed");
  });
});
