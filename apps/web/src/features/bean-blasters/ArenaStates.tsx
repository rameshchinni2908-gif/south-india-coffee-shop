import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import { Box, Button, CircularProgress, Paper, Skeleton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface ArenaLoadingStateProps {
  label: string;
  tiles?: number;
}

export const ArenaLoadingState = ({ label, tiles = 3 }: ArenaLoadingStateProps) => (
  <Box role="status" aria-label={label}>
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))" },
        gap: 2,
      }}
    >
      {Array.from({ length: tiles }, (_, index) => (
        <Skeleton key={index} variant="rounded" height={150} animation="wave" />
      ))}
    </Box>
    <Stack direction="row" spacing={1.5} sx={{ mt: 3, alignItems: "center" }}>
      <CircularProgress size={18} />
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  </Box>
);

interface ArenaErrorStateProps {
  title: string;
  message: string;
  actionLabel: string;
  onAction(): void;
  secondary?: ReactNode;
}

export const ArenaErrorState = ({
  title,
  message,
  actionLabel,
  onAction,
  secondary,
}: ArenaErrorStateProps) => (
  <Paper
    variant="outlined"
    role="alert"
    sx={{ p: { xs: 3, md: 5 }, textAlign: "center", maxWidth: 560, mx: "auto" }}
  >
    <ErrorOutlineOutlinedIcon color="primary" sx={{ fontSize: 52 }} />
    <Typography component="h2" variant="h5" sx={{ mt: 1.5, fontWeight: 850 }}>
      {title}
    </Typography>
    <Typography color="text.secondary" sx={{ mt: 1 }}>
      {message}
    </Typography>
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      sx={{ mt: 3, justifyContent: "center" }}
    >
      <Button variant="contained" onClick={onAction}>
        {actionLabel}
      </Button>
      {secondary}
    </Stack>
  </Paper>
);

interface ArenaEmptyStateProps {
  title: string;
  message: string;
}

export const ArenaEmptyState = ({ title, message }: ArenaEmptyStateProps) => (
  <Stack
    sx={{
      py: { xs: 5, md: 7 },
      px: 3,
      border: "1px dashed",
      borderColor: "divider",
      borderRadius: 4,
      alignItems: "center",
      textAlign: "center",
    }}
  >
    <GroupsOutlinedIcon color="primary" sx={{ fontSize: 46 }} />
    <Typography component="h3" variant="h6" sx={{ mt: 1.5, fontWeight: 850 }}>
      {title}
    </Typography>
    <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 420 }}>
      {message}
    </Typography>
  </Stack>
);
