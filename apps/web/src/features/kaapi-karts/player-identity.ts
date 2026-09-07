import { PLAYER_ID_PATTERN, STORAGE_PLAYER_ID } from "./game-contract.js";

const PLAYER_ID_BYTES = 16;

/** 32 lowercase hex characters, matching PLAYER_ID_PATTERN in the contract. */
export const createPlayerId = (): string => {
  const bytes = new Uint8Array(PLAYER_ID_BYTES);

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const readPlayerId = (): string | null => {
  try {
    const stored = window.localStorage.getItem(STORAGE_PLAYER_ID);

    return stored !== null && PLAYER_ID_PATTERN.test(stored) ? stored : null;
  } catch {
    return null;
  }
};

export const storePlayerId = (playerId: string): void => {
  if (!PLAYER_ID_PATTERN.test(playerId)) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_PLAYER_ID, playerId);
  } catch {
    // Without storage the player simply gets a fresh slot after a refresh.
  }
};

export const clearPlayerId = (): void => {
  try {
    window.localStorage.removeItem(STORAGE_PLAYER_ID);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
};

/**
 * The server is the authority on player identity; this only supplies a stable
 * candidate so a reload of the same phone reclaims the same slot.
 */
export const ensurePlayerId = (): string => {
  const existing = readPlayerId();

  if (existing !== null) {
    return existing;
  }

  const created = createPlayerId();
  storePlayerId(created);

  return created;
};
