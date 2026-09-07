import { Box, Typography } from "@mui/material";

import { faceFor } from "./merge-contract.js";

interface MergeTileProps {
  value: number;
  reducedMotion: boolean;
}

/**
 * One filled cell. The name is the headline and the number sits under it, so the
 * board reads as a coffee ladder rather than a wall of powers of two.
 */
export const MergeTile = ({ value, reducedMotion }: MergeTileProps) => {
  const face = faceFor(value);
  // Long names on small tiles need to shrink or they wrap into three lines.
  const nameSize = face.name.length > 8 ? "0.62rem" : "0.72rem";

  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        borderRadius: 2,
        display: "grid",
        placeContent: "center",
        textAlign: "center",
        px: 0.5,
        backgroundColor: face.background,
        color: face.foreground,
        boxShadow: "0 1px 3px rgba(45, 27, 19, 0.18)",
        ...(reducedMotion
          ? {}
          : {
              animation: "bean-merge-pop 140ms ease-out",
              "@keyframes bean-merge-pop": {
                from: { transform: "scale(0.82)", opacity: 0.6 },
                to: { transform: "scale(1)", opacity: 1 },
              },
            }),
      }}
    >
      {face.name ? (
        <Typography
          component="span"
          sx={{ fontSize: nameSize, fontWeight: 800, lineHeight: 1.15, letterSpacing: 0.1 }}
        >
          {face.name}
        </Typography>
      ) : null}
      <Typography
        component="span"
        sx={{
          fontSize: value >= 1024 ? "0.95rem" : "1.15rem",
          fontWeight: 900,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.2,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
};
