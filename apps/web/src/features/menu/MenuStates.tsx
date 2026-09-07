import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";

export const MenuLoadingState = ({ paused = false }: { paused?: boolean }) => {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsSlow(true), 8_000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      {isSlow && !paused && (
        <Alert severity="info" role="status" sx={{ mb: 2 }}>
          The menu is taking a little longer. We’re still connecting — no need to refresh.
        </Alert>
      )}
      <Box
        aria-label="Loading menu"
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
          gap: 2.5,
          "@media (prefers-reduced-motion: reduce)": {
            "& .MuiSkeleton-root, & .MuiSkeleton-root::after": { animation: "none" },
          },
        }}
      >
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={index} variant="outlined">
            <Skeleton variant="rectangular" height={210} animation={false} />
            <CardContent>
              <Skeleton width="40%" />
              <Skeleton height={38} width="75%" />
              <Skeleton />
              <Skeleton width="88%" />
              <Skeleton sx={{ mt: 2 }} width="35%" />
            </CardContent>
          </Card>
        ))}
      </Box>
    </>
  );
};

interface MenuErrorStateProps {
  onRetry(): void;
}

export const MenuErrorState = ({ onRetry }: MenuErrorStateProps) => (
  <Alert
    severity="error"
    icon={<ErrorOutlineRoundedIcon />}
    action={
      <Button color="inherit" size="small" onClick={onRetry}>
        Try again
      </Button>
    }
    sx={{ alignItems: "center" }}
  >
    <AlertTitle>We couldn’t load the menu</AlertTitle>
    Check your connection and try once more.
  </Alert>
);

interface MenuEmptyStateProps {
  onClear(): void;
}

export const MenuEmptyState = ({ onClear }: MenuEmptyStateProps) => (
  <Stack
    sx={{
      py: { xs: 7, md: 10 },
      px: 2,
      border: "1px dashed",
      borderColor: "divider",
      alignItems: "center",
      textAlign: "center",
    }}
  >
    <SearchOffRoundedIcon color="primary" sx={{ fontSize: 54 }} />
    <Typography component="h3" variant="h5" sx={{ mt: 2, fontWeight: 850 }}>
      No menu items found
    </Typography>
    <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 460 }}>
      Try another search, category, or availability option.
    </Typography>
    <Button variant="outlined" sx={{ mt: 3 }} onClick={onClear}>
      Clear filters
    </Button>
  </Stack>
);
