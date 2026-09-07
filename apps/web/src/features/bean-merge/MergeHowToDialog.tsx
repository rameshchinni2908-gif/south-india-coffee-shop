import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  Stack,
  Typography,
} from "@mui/material";

import { GAME_DISPLAY_NAME, WIN_VALUE } from "./merge-contract.js";

interface MergeHowToDialogProps {
  open: boolean;
  reducedMotion: boolean;
  onClose: () => void;
}

const STEPS: readonly { title: string; detail: string }[] = [
  {
    title: "Swipe any direction",
    detail: "Every tile slides that way. Arrow keys or WASD work too.",
  },
  {
    title: "Equal tiles merge",
    detail: "Two seeds make a cherry, two cherries make a green bean, and up it goes.",
  },
  {
    title: `Reach the davara (${WIN_VALUE})`,
    detail: "No timer, no rush. Undo one move if a swipe goes wrong.",
  },
];

export const MergeHowToDialog = ({ open, reducedMotion, onClose }: MergeHowToDialogProps) => (
  <Dialog
    open={open}
    onClose={onClose}
    maxWidth="xs"
    fullWidth
    transitionDuration={reducedMotion ? 0 : undefined}
    slots={{ transition: Fade }}
    aria-labelledby="bean-merge-how-to-title"
  >
    <DialogTitle id="bean-merge-how-to-title" sx={{ pb: 1 }}>
      {GAME_DISPLAY_NAME} in three lines
    </DialogTitle>
    <DialogContent>
      <Stack spacing={2.25} sx={{ mt: 0.5 }}>
        {STEPS.map((step) => (
          <Stack key={step.title} spacing={0.5}>
            <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 800 }}>
              {step.title}
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: 15 }}>
              {step.detail}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2.5 }}>
      <Button onClick={onClose} variant="contained" fullWidth>
        Got it
      </Button>
    </DialogActions>
  </Dialog>
);
