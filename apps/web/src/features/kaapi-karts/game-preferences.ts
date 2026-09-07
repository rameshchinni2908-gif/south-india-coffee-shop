import { STORAGE_HAPTICS, STORAGE_SEEN_HOW_TO } from "./game-contract.js";

const readFlag = (key: string): boolean => {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    // Private-mode Safari throws on storage access; treat it as "not set".
    return false;
  }
};

const writeFlag = (key: string, value: boolean): void => {
  try {
    window.localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // A player who blocks storage simply sees the how-to again next visit.
  }
};

export const hasSeenHowToPlay = (): boolean => readFlag(STORAGE_SEEN_HOW_TO);

export const markHowToPlaySeen = (): void => writeFlag(STORAGE_SEEN_HOW_TO, true);

export const isHapticsEnabled = (): boolean => readFlag(STORAGE_HAPTICS);

export const setHapticsEnabled = (enabled: boolean): void => writeFlag(STORAGE_HAPTICS, enabled);

/** Fires only when the player has opted in; silently ignored where unsupported. */
export const pulse = (pattern: number | readonly number[]): void => {
  if (!isHapticsEnabled()) {
    return;
  }

  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }

  try {
    navigator.vibrate(Array.isArray(pattern) ? [...pattern] : (pattern as number));
  } catch {
    // iOS Safari has no vibration motor; nothing to recover from.
  }
};
