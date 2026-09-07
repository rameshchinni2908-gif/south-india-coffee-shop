import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import SwipeOutlinedIcon from "@mui/icons-material/SwipeOutlined";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import type { SvgIconComponent } from "@mui/icons-material";
import { useState } from "react";

import { markHowToPlaySeen } from "./game-preferences.js";
import { useReducedMotion } from "./use-reduced-motion.js";

interface HowToCard {
  readonly id: string;
  readonly icon: SvgIconComponent;
  readonly title: string;
  readonly body: string;
}

const HOW_TO_CARDS: readonly HowToCard[] = [
  {
    id: "steer",
    icon: SwipeOutlinedIcon,
    title: "Hold left or right to steer",
    body: "Your kart accelerates on its own. Tap and hold either side of the screen to turn, and use the brake in the middle for tight corners.",
  },
  {
    id: "boost",
    icon: BoltOutlinedIcon,
    title: "Hit the glowing pads for a boost",
    body: "Boost pads sit on the racing line through the fast corners. Wander onto the grass and you will slow right down — nothing breaks, you just lose time.",
  },
  {
    id: "stakes",
    icon: EmojiEventsOutlinedIcon,
    title: "Three laps. Last place buys the coffee",
    body: "Everyone starts together on the same track. Finish all three laps, then the standings decide who is buying. Just for fun — settle the bill however you like.",
  },
];

interface HowToPlayDialogProps {
  open: boolean;
  onClose(): void;
}

export const HowToPlayDialog = ({ open, onClose }: HowToPlayDialogProps) => {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const lastIndex = HOW_TO_CARDS.length - 1;
  const activeCard = HOW_TO_CARDS[index] ?? HOW_TO_CARDS[0];

  // React's "adjust state when a prop changes" pattern: rewinding to the first
  // card during render avoids the extra commit an effect would cause.
  const [wasOpen, setWasOpen] = useState(open);

  if (wasOpen !== open) {
    setWasOpen(open);

    if (open) {
      setIndex(0);
    }
  }

  const dismiss = () => {
    markHowToPlaySeen();
    onClose();
  };

  if (!activeCard) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      fullWidth
      maxWidth="sm"
      aria-labelledby="kaapi-how-to-title"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 4,
            mb: "calc(16px + env(safe-area-inset-bottom))",
            mt: "calc(16px + env(safe-area-inset-top))",
          },
        },
      }}
    >
      <DialogTitle id="kaapi-how-to-title" sx={{ pb: 0.5 }}>
        <Typography component="span" variant="overline" color="secondary.dark">
          How to play
        </Typography>
        <Typography component="h2" variant="h4" sx={{ fontWeight: 700 }}>
          Kaapi Karts in three cards
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pb: 1 }}>
        <Box
          data-testid="how-to-carousel"
          data-motion={reducedMotion ? "reduced" : "full"}
          sx={{ overflow: "hidden", borderRadius: 3, bgcolor: "background.default" }}
        >
          <Box
            sx={{
              display: "flex",
              width: `${HOW_TO_CARDS.length * 100}%`,
              transform: `translateX(-${(index * 100) / HOW_TO_CARDS.length}%)`,
              transition: reducedMotion
                ? "none"
                : "transform 380ms cubic-bezier(0.22, 0.8, 0.28, 1)",
            }}
          >
            {HOW_TO_CARDS.map((card, cardIndex) => {
              const Icon = card.icon;
              const isActive = cardIndex === index;

              return (
                <Box
                  key={card.id}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`Step ${cardIndex + 1} of ${HOW_TO_CARDS.length}`}
                  aria-hidden={!isActive}
                  sx={{
                    width: `${100 / HOW_TO_CARDS.length}%`,
                    flexShrink: 0,
                    px: { xs: 2.5, sm: 4 },
                    py: { xs: 4, sm: 5 },
                    textAlign: "center",
                    opacity: reducedMotion && !isActive ? 0 : 1,
                    transition: reducedMotion ? "opacity 160ms linear" : "none",
                  }}
                >
                  <Icon color="primary" sx={{ fontSize: 56 }} />
                  <Typography component="h3" variant="h6" sx={{ mt: 1.5, fontWeight: 850 }}>
                    {card.title}
                  </Typography>
                  <Typography color="text.secondary" sx={{ mt: 1, mx: "auto", maxWidth: 420 }}>
                    {card.body}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>

        <Stack
          direction="row"
          spacing={1}
          component="ol"
          sx={{ listStyle: "none", p: 0, mt: 2.5, justifyContent: "center" }}
        >
          {HOW_TO_CARDS.map((card, cardIndex) => (
            <Box component="li" key={card.id} sx={{ listStyle: "none" }}>
              <Box
                component="button"
                type="button"
                onClick={() => setIndex(cardIndex)}
                aria-label={`Show step ${cardIndex + 1}: ${card.title}`}
                aria-current={cardIndex === index}
                sx={{
                  width: 44,
                  height: 44,
                  p: 0,
                  border: 0,
                  cursor: "pointer",
                  bgcolor: "transparent",
                  display: "grid",
                  placeItems: "center",
                  "&::after": {
                    content: '""',
                    width: cardIndex === index ? 26 : 10,
                    height: 10,
                    borderRadius: 999,
                    bgcolor: cardIndex === index ? "primary.main" : "rgba(45, 27, 19, 0.22)",
                    transition: reducedMotion ? "none" : "width 220ms ease, background-color 220ms",
                  },
                }}
              />
            </Box>
          ))}
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{ px: 3, pb: "calc(16px + env(safe-area-inset-bottom))", gap: 1, flexWrap: "wrap" }}
      >
        <Button onClick={dismiss} color="inherit" sx={{ mr: "auto" }}>
          Skip
        </Button>
        <Button
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={index === 0}
        >
          Back
        </Button>
        {index < lastIndex ? (
          <Button variant="contained" onClick={() => setIndex((current) => current + 1)}>
            Next
          </Button>
        ) : (
          <Button variant="contained" onClick={dismiss}>
            Got it
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
