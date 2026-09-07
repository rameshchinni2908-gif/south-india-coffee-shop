import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import FavoriteBorderOutlinedIcon from "@mui/icons-material/FavoriteBorderOutlined";
import FavoriteOutlinedIcon from "@mui/icons-material/FavoriteOutlined";
import OfflineBoltOutlinedIcon from "@mui/icons-material/OfflineBoltOutlined";
import { Box, Chip, Stack, Typography } from "@mui/material";

import { formatBadgeNumber, POWER_UP_LABELS, WEAPON, type PowerUpKind } from "./arena-contract.js";

export interface HudScoreRow {
  readonly badgeNumber: number;
  readonly colourHex: string;
  readonly hits: number;
  readonly isSelf: boolean;
}

/** Counts DOWN from 2:00. Rendered with tabular figures so it never jitters. */
export const formatRoundClock = (remainingMs: number): string => {
  const safeMs = Math.max(0, Math.ceil(remainingMs / 1_000) * 1_000);
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1_000);

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

interface BattleHudProps {
  badgeNumber: number;
  colourHex: string;
  emoji: string | null;
  hearts: number;
  maxHearts: number;
  remainingMs: number;
  hits: number;
  ammo: number;
  reloading: boolean;
  /** 0 → 1 across the refill break. Drives the sweep over the ammo strip. */
  reloadProgress: number;
  powerUp: PowerUpKind | null;
  powerUpRemainingMs: number;
  scoreboard: readonly HudScoreRow[];
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

const AMMO_PIPS = Array.from({ length: WEAPON.clipSize }, (_, index) => index);

export const BattleHud = ({
  badgeNumber,
  colourHex,
  emoji,
  hearts,
  maxHearts,
  remainingMs,
  hits,
  ammo,
  reloading,
  reloadProgress,
  powerUp,
  powerUpRemainingMs,
  scoreboard,
  offline,
}: BattleHudProps) => (
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
          {formatBadgeNumber(badgeNumber)}
        </Box>
        <Box>
          <Stack direction="row" spacing={0.25} data-testid="battle-hearts" aria-hidden>
            {Array.from({ length: maxHearts }, (_, index) =>
              index < hearts ? (
                <FavoriteOutlinedIcon key={index} sx={{ fontSize: 18, color: "#e08a8a" }} />
              ) : (
                <FavoriteBorderOutlinedIcon key={index} sx={{ fontSize: 18, opacity: 0.45 }} />
              ),
            )}
          </Stack>
          <Typography
            component="p"
            data-testid="battle-splashes"
            sx={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}
          >
            {hits} splash{hits === 1 ? "" : "es"}
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
            LEFT
          </Typography>
          <Typography
            component="p"
            data-testid="battle-clock"
            sx={{ fontWeight: 900, fontSize: 22, fontVariantNumeric: "tabular-nums" }}
          >
            {formatRoundClock(remainingMs)}
          </Typography>
        </Box>
        {offline ? (
          <Chip
            size="small"
            icon={<CloudOffOutlinedIcon fontSize="small" />}
            label="Offline — reconnecting"
            sx={{ bgcolor: "rgba(30, 15, 9, 0.72)", color: "#fffdf8", fontWeight: 700 }}
          />
        ) : null}
      </Stack>
    </Stack>

    <Stack
      component="ol"
      aria-label="Live scoreboard"
      sx={{ listStyle: "none", p: 0, m: 0, gap: 0.5, alignSelf: "flex-start", ...panelSx }}
    >
      {scoreboard.map((row) => (
        <Stack
          key={row.badgeNumber}
          component="li"
          direction="row"
          spacing={0.75}
          sx={{ alignItems: "center", listStyle: "none" }}
        >
          <Box
            aria-hidden
            sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: row.colourHex }}
          />
          <Typography
            component="span"
            sx={{
              fontSize: 13,
              fontWeight: row.isSelf ? 900 : 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatBadgeNumber(row.badgeNumber)}
            {row.isSelf ? " · you" : ""}
          </Typography>
          <Typography
            component="span"
            sx={{ ml: "auto", pl: 1, fontSize: 13, fontVariantNumeric: "tabular-nums" }}
          >
            {row.hits}
          </Typography>
        </Stack>
      ))}
    </Stack>

    <Stack direction="row" spacing={1} sx={{ mt: "auto", alignItems: "center", flexWrap: "wrap" }}>
      {powerUp ? (
        <Chip
          size="small"
          icon={<OfflineBoltOutlinedIcon fontSize="small" />}
          data-testid="battle-power-up"
          label={`${POWER_UP_LABELS[powerUp]} ${Math.max(0, Math.ceil(powerUpRemainingMs / 1_000))}s`}
          sx={{
            fontWeight: 800,
            color: "#fffdf8",
            bgcolor: "#b85f16",
            fontVariantNumeric: "tabular-nums",
            "& .MuiChip-icon": { color: "inherit" },
          }}
        />
      ) : null}
    </Stack>

    <Box
      data-testid="battle-ammo"
      aria-hidden
      sx={{ ...panelSx, position: "relative", overflow: "hidden", alignSelf: "flex-start" }}
    >
      <Stack direction="row" spacing={0.5}>
        {AMMO_PIPS.map((pip) => (
          <Box
            key={pip}
            data-testid="battle-ammo-pip"
            data-loaded={pip < ammo ? "true" : "false"}
            sx={{
              width: 10,
              height: 18,
              borderRadius: 999,
              bgcolor: pip < ammo ? "#f0c27a" : "rgba(255, 253, 248, 0.22)",
              transition: "background-color 120ms linear",
            }}
          />
        ))}
      </Stack>
      {reloading ? (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            bgcolor: "rgba(184, 95, 22, 0.55)",
            transformOrigin: "left center",
            // Driven by the engine's own reload clock rather than a CSS
            // animation, so it stays in step with the server's timer.
            transform: `scaleX(${Math.min(1, Math.max(0, reloadProgress))})`,
          }}
        />
      ) : null}
    </Box>

    <Typography
      component="p"
      variant="caption"
      sx={{ color: "#fffdf8", opacity: 0.75, fontWeight: 700 }}
    >
      {reloading ? "Refill break…" : `${ammo}/${WEAPON.clipSize} beans`}
    </Typography>
  </Box>
);
