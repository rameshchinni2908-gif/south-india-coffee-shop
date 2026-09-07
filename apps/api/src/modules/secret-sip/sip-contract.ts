// Mirrored in the web feature. A contract test enforces byte-for-byte equality.
export const SIP_NAME = "Secret Sip";
export const SIP_PATH = "/games/secret-sip";
export const SIP_SOCKET_PATH = "/sip-socket.io";
export const SIP_MIN_PLAYERS = 3;
export const SIP_MAX_PLAYERS = 8;
export const SIP_TIMING = {
  reveal: 12_000,
  clue: 12_000,
  discuss: 35_000,
  vote: 25_000,
  guess: 15_000,
};
export type SipPhase = "LOBBY" | "REVEAL" | "CLUES" | "DISCUSS" | "VOTING" | "GUESS" | "RESULTS";
export interface SipPlayer {
  id: string;
  seat: number;
  connected: boolean;
  ready: boolean;
  score: number;
  voted: boolean;
}
export interface SipResult {
  winner: "TABLE" | "BLUFFER";
  reason: "CAUGHT" | "ESCAPED" | "TIE" | "GUESSED";
  blufferId: string;
  word: string;
  guess: string | null;
  votes: { voterId: string; targetId: string }[];
}
export interface SipState {
  code: string;
  round: number;
  phase: SipPhase;
  hostId: string;
  youId: string;
  players: SipPlayer[];
  serverNow: number;
  deadline: number | null;
  turnId: string | null;
  category: string | null;
  role: "REGULAR" | "BLUFFER" | null;
  word: string | null;
  yourVote: string | null;
  result: SipResult | null;
}
export interface SipIdentity {
  code: string;
  token: string;
}
export type SipAction =
  | { type: "ready"; round: number; ready: boolean }
  | { type: "start" | "clue" | "discussed" | "rematch" | "leave"; round: number }
  | { type: "vote" | "remove"; round: number; targetId: string }
  | { type: "guess"; round: number; word: string };
export interface SipReply {
  ok: boolean;
  message?: string;
}
export interface SipServerEvents {
  "sip:state": (state: SipState) => void;
  "sip:closed": () => void;
}
export interface SipClientEvents {
  "sip:action": (action: SipAction, reply: (result: SipReply) => void) => void;
}
