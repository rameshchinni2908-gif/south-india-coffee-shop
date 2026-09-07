import useMediaQuery from "@mui/material/useMediaQuery";

/**
 * Players who ask their device for less motion get instant cross-fades instead
 * of slides, scales and pulses. Essential feedback is never removed.
 */
export const useReducedMotion = (): boolean =>
  useMediaQuery("(prefers-reduced-motion: reduce)", { noSsr: true });
