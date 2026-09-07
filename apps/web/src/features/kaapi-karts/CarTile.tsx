import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import RadioButtonUncheckedOutlinedIcon from "@mui/icons-material/RadioButtonUncheckedOutlined";
import WorkspacePremiumOutlinedIcon from "@mui/icons-material/WorkspacePremiumOutlined";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";

import { findCarColour, formatCarNumber, type GamePlayer } from "./game-contract.js";

interface CarTileProps {
  player: GamePlayer;
  isYou: boolean;
  reducedMotion: boolean;
}

export const CarTile = ({ player, isYou, reducedMotion }: CarTileProps) => {
  const colour = findCarColour(player.colour);
  const colourHex = colour?.hex ?? "#6f3219";
  const colourLabel = colour?.label ?? "Unassigned colour";
  const number = formatCarNumber(player.carNumber);
  const readyLabel = player.isReady ? "Ready" : "Not ready";
  const connectionLabel = player.isConnected ? "Connected" : "Reconnecting";

  return (
    <Paper
      component="li"
      variant="outlined"
      aria-label={`Car ${number}, ${colourLabel}, ${readyLabel}${isYou ? ", you" : ""}${
        player.isHost ? ", host" : ""
      }, ${connectionLabel}`}
      sx={{
        position: "relative",
        listStyle: "none",
        p: 2,
        pt: 2.5,
        overflow: "hidden",
        borderColor: isYou ? colourHex : "divider",
        borderWidth: isYou ? 2 : 1,
        transition: reducedMotion ? "none" : "border-color 200ms ease, transform 200ms ease",
      }}
    >
      <Box
        aria-hidden
        sx={{ position: "absolute", insetInline: 0, top: 0, height: 6, bgcolor: colourHex }}
      />

      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <Box
          aria-hidden
          sx={{
            width: 62,
            height: 62,
            flexShrink: 0,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            color: "#fffdf8",
            bgcolor: colourHex,
            fontWeight: 900,
            fontSize: 26,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
          }}
        >
          {number}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="p"
            sx={{ fontWeight: 850, fontSize: 17, lineHeight: 1.2 }}
            aria-hidden
          >
            Car {number}
          </Typography>
          <Typography variant="body2" color="text.secondary" aria-hidden sx={{ mt: 0.25 }}>
            {colourLabel}
          </Typography>
          {player.emoji ? (
            <Box component="span" aria-hidden sx={{ fontSize: 22, lineHeight: 1 }}>
              {player.emoji}
            </Box>
          ) : null}
        </Box>
        <Box
          aria-hidden
          title={connectionLabel}
          sx={{
            ml: "auto",
            alignSelf: "flex-start",
            width: 10,
            height: 10,
            borderRadius: "50%",
            bgcolor: player.isConnected ? "success.main" : "text.disabled",
          }}
        />
      </Stack>

      <Stack direction="row" spacing={0.75} sx={{ mt: 1.75, flexWrap: "wrap", gap: 0.75 }}>
        <Chip
          size="small"
          aria-hidden
          icon={
            player.isReady ? (
              <CheckCircleOutlineOutlinedIcon fontSize="small" />
            ) : (
              <RadioButtonUncheckedOutlinedIcon fontSize="small" />
            )
          }
          label={readyLabel}
          color={player.isReady ? "success" : "default"}
          variant={player.isReady ? "filled" : "outlined"}
        />
        {player.isHost ? (
          <Chip
            size="small"
            aria-hidden
            icon={<WorkspacePremiumOutlinedIcon fontSize="small" />}
            label="Host"
            variant="outlined"
          />
        ) : null}
        {isYou ? <Chip size="small" aria-hidden label="You" color="primary" /> : null}
      </Stack>
    </Paper>
  );
};
