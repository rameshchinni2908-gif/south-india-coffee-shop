import useMediaQuery from "@mui/material/useMediaQuery";

/**
 * Players who ask their device for less motion get tiles that simply appear,
 * with no slide or pop. Essential feedback is never removed.
 *
 * Deliberately its own copy rather than an import from another game's folder, so
 * either feature can be deleted without touching the other (BEAN-MERGE.md §3).
 */
export const useReducedMotion = (): boolean =>
  useMediaQuery("(prefers-reduced-motion: reduce)", { noSsr: true });
