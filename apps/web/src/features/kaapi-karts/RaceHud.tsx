import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import { Box, Chip, Stack, Typography } from "@mui/material";

import { formatCarNumber } from "./game-contract.js";

export interface HudStanding {
  readonly carNumber: number;
  readonly colourHex: string;
  readonly isSelf: boolean;
}

export const formatRaceClock = (elapsedMs: number): string => {
  const safeMs = Math.max(0, Math.round(elapsedMs));
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1_000);
  const tenths = Math.floor((safeMs % 1_000) / 100);

  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
};

interface RaceHudProps {
  carNumber: number;
  colourHex: string;
  emoji: string | null;
  lap: number;
  totalLaps: number;
  elapsedMs: number;
  position: number;
  fieldSize: number;
  boostReady: boolean;
  standings: readonly HudStanding[];
  offline: boolean;
}

const panelSx = {
  px: 1.5,
  py: 1,
  borderRadius: 3,
  bgcolor: "rgba(30, 15, 9, 0.6)",
  color: "#fffdf8",
  backdropFilter: "blur(8px)",
} as const;

export const RaceHud = ({
  carNumber,
  colourHex,
  emoji,
  lap,
  totalLaps,
  elapsedMs,
  position,
  fieldSize,
  boostReady,
  standings,
  offline,
}: RaceHudProps) => (
  <Box
    sx={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      p: 1.5,
      pt: "calc(12px + env(safe-area-inset-top))",
      px: "calc(12px + env(safe-area-inset-left))",
      display: "flex",
      flexDirection: "column",
      gap: 1,
    }}
  >
    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
      <Stack direction="row" spacing={1} sx={{ ...panelSx, alignItems: "center" }}>
        <Box
          aria-hidden
          sx={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            bgcolor: colourHex,
            display: "grid",
            placeItems: "center",
            fontWeight: 900,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatCarNumber(carNumber)}
        </Box>
        <Box>
          <Typography
            component="p"
            sx={{ fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}
            data-testid="race-lap"
          >
            Lap {Math.min(lap, totalLaps)}/{totalLaps}
          </Typography>
          <Typography
            component="p"
            data-testid="race-clock"
            sx={{
              fontSize: 20,
              fontWeight: 800,
              lineHeight: 1.15,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatRaceClock(elapsedMs)}
          </Typography>
        </Box>
        {emoji ? (
          <Box component="span" aria-hidden sx={{ fontSize: 20 }}>
            {emoji}
          </Box>
        ) : null}
      </Stack>

      <Stack spacing={0.75} sx={{ ml: "auto", alignItems: "flex-end" }}>
        <Box sx={{ ...panelSx, textAlign: "right" }}>
          <Typography
            component="p"
            variant="caption"
            sx={{ opacity: 0.75, letterSpacing: "0.1em" }}
          >
            POSITION
          </Typography>
          <Typography
            component="p"
            sx={{ fontWeight: 900, fontSize: 20, fontVariantNumeric: "tabular-nums" }}
          >
            P{position}
            <Box component="span" sx={{ opacity: 0.6, fontSize: 13, ml: 0.5 }}>
              / {fieldSize}
            </Box>
          </Typography>
        </Box>
        {offline ? (
          <Chip
            size="small"
            icon={<CloudOffOutlinedIcon fontSize="small" />}
            label="Offline — still racing"
            sx={{ bgcolor: "rgba(30, 15, 9, 0.72)", color: "#fffdf8", fontWeight: 700 }}
          />
        ) : null}
      </Stack>
    </Stack>

    <Stack
      component="ol"
      aria-label="Running order"
      sx={{ listStyle: "none", p: 0, m: 0, gap: 0.5, alignSelf: "flex-start", ...panelSx }}
    >
      {standings.map((standing, index) => (
        <Stack
          key={standing.carNumber}
          component="li"
          direction="row"
          spacing={0.75}
          sx={{ alignItems: "center", listStyle: "none" }}
        >
          <Typography
            component="span"
            sx={{
              fontSize: 12,
              width: 18,
              opacity: 0.7,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            P{index + 1}
          </Typography>
          <Box
            aria-hidden
            sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: standing.colourHex }}
          />
          <Typography
            component="span"
            sx={{
              fontSize: 13,
              fontWeight: standing.isSelf ? 900 : 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatCarNumber(standing.carNumber)}
            {standing.isSelf ? " · you" : ""}
          </Typography>
        </Stack>
      ))}
    </Stack>

    <Chip
      size="small"
      icon={<BoltOutlinedIcon fontSize="small" />}
      label={boostReady ? "Boost ready" : "Boost charging"}
      sx={{
        alignSelf: "flex-start",
        fontWeight: 700,
        color: "#fffdf8",
        bgcolor: boostReady ? "#28734f" : "rgba(30, 15, 9, 0.6)",
        "& .MuiChip-icon": { color: "inherit" },
      }}
    />
  </Box>
);
