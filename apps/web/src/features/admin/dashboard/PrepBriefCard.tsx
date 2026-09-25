import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import WbSunnyOutlinedIcon from "@mui/icons-material/WbSunnyOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { formatShopDateTime } from "../../orders/order-format.js";
import {
  PREP_BRIEF_QUERY_KEY,
  prepBriefQuery,
  regeneratePrepBrief,
  type PrepBrief,
} from "./prep-brief-api.js";

// Shown instead of the summary when it was not written; SKIPPED needs no explanation.
const NARRATIVE_NOTE: Partial<Record<PrepBrief["narrativeStatus"], string>> = {
  REJECTED: "The written summary used a number not in the plan, so it was left out.",
  FAILED: "The written summary could not be generated. The plan below is complete.",
};

const PlanTable = ({ brief }: { brief: PrepBrief }) => (
  <TableContainer>
    <Table size="small" aria-label={`Prep plan for ${brief.forecast.weekday}`}>
      <TableHead>
        <TableRow>
          <TableCell>Item</TableCell>
          <TableCell align="right">Usual {brief.forecast.weekday}</TableCell>
          <TableCell align="right">Prepare</TableCell>
          <TableCell align="right">In stock</TableCell>
          <TableCell align="right">Restock</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {brief.forecast.items.map((item) => (
          <TableRow key={item.variantId}>
            <TableCell sx={{ overflowWrap: "anywhere" }}>
              {item.productName} ({item.variantName})
              {!item.isAvailable && (
                <Chip size="small" label="Switched off" sx={{ ml: 1 }} variant="outlined" />
              )}
              {item.lowConfidence && (
                <Chip size="small" label="Little history" sx={{ ml: 1 }} variant="outlined" />
              )}
            </TableCell>
            <TableCell align="right">
              {item.averageUnits} (max {item.highestUnits})
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>
              {item.suggestedPrep}
            </TableCell>
            <TableCell align="right">{item.stockQuantity}</TableCell>
            <TableCell
              align="right"
              sx={{ color: item.restockNeeded ? "warning.dark" : undefined }}
            >
              {item.restockNeeded || "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
);

// Numbers come from the API's calculation; the model's text is only a summary of them.
export const PrepBriefCard = ({ canRegenerate }: { canRegenerate: boolean }) => {
  const queryClient = useQueryClient();
  const briefQuery = useQuery(prepBriefQuery());
  const regenerate = useMutation({
    mutationFn: regeneratePrepBrief,
    retry: false,
    onSuccess: (brief) => queryClient.setQueryData(PREP_BRIEF_QUERY_KEY, brief),
  });
  const brief = briefQuery.data;

  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby="prep-brief-title"
      sx={{ p: { xs: 2.5, md: 3 } }}
    >
      <Stack spacing={2}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" } }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <WbSunnyOutlinedIcon color="primary" />
            <Box>
              <Typography id="prep-brief-title" component="h2" variant="h5">
                {brief ? `Prep plan for ${brief.forecast.weekday}` : "Today's prep plan"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Based on the last {brief?.forecast.weeksLookedBack ?? 4} same weekdays, plus a small
                buffer.
              </Typography>
            </Box>
          </Stack>
          {canRegenerate && brief && (
            <Button
              size="small"
              startIcon={<RefreshRoundedIcon />}
              disabled={regenerate.isPending}
              onClick={() => regenerate.mutate()}
            >
              {regenerate.isPending ? "Updating…" : "Update with latest orders"}
            </Button>
          )}
        </Stack>

        {briefQuery.isPending && (
          <Stack role="status" direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <CircularProgress size={18} aria-label="Preparing today's plan" />
            <Typography variant="body2">Preparing today's plan…</Typography>
          </Stack>
        )}
        {briefQuery.isError && (
          <Alert
            severity="error"
            action={<Button onClick={() => void briefQuery.refetch()}>Try again</Button>}
          >
            Today's prep plan could not be loaded.
          </Alert>
        )}
        {regenerate.isError && <Alert severity="error">The plan could not be updated.</Alert>}
        {brief &&
          (brief.forecast.items.length === 0 ? (
            <Alert severity="info">
              Not enough order history for {brief.forecast.weekday}s yet. The plan appears once
              there are orders on earlier {brief.forecast.weekday}s.
            </Alert>
          ) : (
            <Stack spacing={1.5}>
              {brief.narrative ? (
                <Typography sx={{ whiteSpace: "pre-wrap" }}>{brief.narrative}</Typography>
              ) : (
                NARRATIVE_NOTE[brief.narrativeStatus] && (
                  <Typography variant="body2" color="text.secondary">
                    {NARRATIVE_NOTE[brief.narrativeStatus]}
                  </Typography>
                )
              )}
              <PlanTable brief={brief} />
              <Typography variant="caption" color="text.secondary">
                Prepared {formatShopDateTime(brief.generatedAt)} IST. Suggestions only; check the
                shelves before restocking.
              </Typography>
            </Stack>
          ))}
      </Stack>
    </Paper>
  );
};
