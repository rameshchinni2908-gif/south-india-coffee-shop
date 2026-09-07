import useMediaQuery from "@mui/material/useMediaQuery";

/**
 * Players who ask their device for less motion get instant cross-fades instead
 * of slides, shakes and splash particles. Essential feedback — the splash
 * banner, the heart count, the countdown — is never removed.
 */
export const useReducedMotion = (): boolean =>
  useMediaQuery("(prefers-reduced-motion: reduce)", { noSsr: true });
