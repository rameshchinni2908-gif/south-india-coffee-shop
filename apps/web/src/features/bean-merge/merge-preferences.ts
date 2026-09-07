/**
 * The only thing this game persists, and it never leaves the device: a best
 * score and whether the how-to has been seen. No account, no server, no PII.
 *
 * Every access is wrapped, because `localStorage` throws rather than returning
 * null in a private window or when site data is blocked.
 */

import { STORAGE_BEST_SCORE, STORAGE_SEEN_HOW_TO } from "./merge-contract.js";

export const readBestScore = (): number => {
  try {
    const stored = window.localStorage.getItem(STORAGE_BEST_SCORE);

    if (stored === null) {
      return 0;
    }

    const parsed = Number.parseInt(stored, 10);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
};

export const storeBestScore = (score: number): void => {
  try {
    window.localStorage.setItem(STORAGE_BEST_SCORE, String(Math.max(0, Math.floor(score))));
  } catch {
    // A best score is a nicety; failing to keep it must never break the game.
  }
};

export const hasSeenHowTo = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_SEEN_HOW_TO) === "true";
  } catch {
    return false;
  }
};

export const storeSeenHowTo = (): void => {
  try {
    window.localStorage.setItem(STORAGE_SEEN_HOW_TO, "true");
  } catch {
    // Ignored: the dialog simply opens again next time.
  }
};
