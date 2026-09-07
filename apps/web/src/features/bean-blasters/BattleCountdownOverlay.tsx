import { Box, Fade, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";

import { GAME_TAGLINE } from "./arena-contract.js";

const TICK_MS = 80;
/** How long "GO" stays on screen after the whistle. */
const GO_HOLD_MS = 700;

const labelFor = (remainingMs: number): string => {
  if (remainingMs <= 0) {
    return "GO";
  }

  return String(Math.min(3, Math.ceil(remainingMs / 1_000)));
};

interface CountdownOverlayProps {
  /** Round start in *local* clock time (server timestamp + clock offset). */
  startAtEpochMs: number;
  reducedMotion: boolean;
  onComplete(): void;
  onGo(): void;
}

export const CountdownOverlay = ({
  startAtEpochMs,
  reducedMotion,
  onComplete,
  onGo,
}: CountdownOverlayProps) => {
  const [remainingMs, setRemainingMs] = useState(() => startAtEpochMs - Date.now());
  const goFiredRef = useRef(false);
  const completeRef = useRef(onComplete);
  const goRef = useRef(onGo);

  // Kept current in an effect rather than during render: the timer below only
  // reads them after paint, and assigning refs mid-render is not safe.
  useEffect(() => {
    completeRef.current = onComplete;
    goRef.current = onGo;
  });

  useEffect(() => {
    goFiredRef.current = false;

    const timer = window.setInterval(() => {
      const nextRemaining = startAtEpochMs - Date.now();
      setRemainingMs(nextRemaining);

      if (nextRemaining <= 0 && !goFiredRef.current) {
        goFiredRef.current = true;
        goRef.current();
      }

      if (nextRemaining <= -GO_HOLD_MS) {
        window.clearInterval(timer);
        completeRef.current();
      }
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [startAtEpochMs]);

  const label = labelFor(remainingMs);
  const isGo = label === "GO";

  return (
    <Box
      data-testid="battle-countdown"
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: (theme) => theme.zIndex.modal,
        display: "grid",
        placeItems: "center",
        px: 3,
        textAlign: "center",
        color: "#fffdf8",
        // Deliberately translucent: the arena stays visible behind it (§10.5).
        background:
          "radial-gradient(120% 90% at 50% 30%, rgba(111, 50, 25, 0.86), rgba(30, 15, 9, 0.94))",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        "@keyframes beanCountdownPop": {
          "0%": { transform: "scale(1.5)", opacity: 0 },
          "45%": { transform: "scale(1)", opacity: 1 },
          "100%": { transform: "scale(0.94)", opacity: 0.85 },
        },
      }}
    >
      <Box>
        <Typography variant="overline" sx={{ letterSpacing: "0.34em", opacity: 0.75 }}>
          Grind up
        </Typography>
        <Typography
          key={label}
          component="p"
          aria-hidden
          sx={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            fontSize: { xs: isGo ? 84 : 140, sm: isGo ? 128 : 200 },
            lineHeight: 1,
            letterSpacing: isGo ? "0.06em" : "-0.04em",
            color: isGo ? "#f0c27a" : "#fffdf8",
            animation: reducedMotion ? "none" : "beanCountdownPop 900ms ease-out both",
          }}
        >
          {label}
        </Typography>
        <Box aria-live="assertive" aria-atomic sx={{ mt: 1 }}>
          <Typography sx={{ opacity: 0.85, fontWeight: 700 }}>
            {isGo ? "Go! Two minutes." : `Starting in ${label}`}
          </Typography>
        </Box>
        <Fade in timeout={reducedMotion ? 0 : 600}>
          <Typography variant="body2" sx={{ mt: 3, opacity: 0.6 }}>
            {GAME_TAGLINE}
          </Typography>
        </Fade>
      </Box>
    </Box>
  );
};
