import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Alert, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiClientError } from "../../../lib/api-client.js";
import { formatShopDateTime } from "../../orders/order-format.js";
import { ADMIN_PRODUCTS_QUERY_KEY } from "../products/admin-catalog-queries.js";
import { DASHBOARD_QUERY_KEY } from "./dashboard-query.js";
import { decideProposal, type ProposalSummary } from "./shop-assistant-api.js";

const DECIDED_LABEL = {
  APPLIED: { label: "Approved and applied", color: "success" },
  REJECTED: { label: "Rejected", color: "default" },
  FAILED: { label: "Not applied", color: "error" },
  EXPIRED: { label: "Expired", color: "default" },
} as const;

// One pending change from the assistant. Only an explicit approval changes shop data.
export const ProposalCard = ({ proposal }: { proposal: ProposalSummary }) => {
  const queryClient = useQueryClient();
  const decision = useMutation({
    mutationFn: decideProposal,
    retry: false,
    // An applied change alters stock, so refresh the figures that show it.
    onSuccess: async ({ status }) => {
      if (status !== "APPLIED") return;
      await Promise.all(
        [DASHBOARD_QUERY_KEY, ADMIN_PRODUCTS_QUERY_KEY, ["products"]].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
  const decided = decision.data;
  const decidedLabel =
    decided && decided.status in DECIDED_LABEL
      ? DECIDED_LABEL[decided.status as keyof typeof DECIDED_LABEL]
      : null;

  return (
    <Paper
      variant="outlined"
      component="li"
      aria-label={`Proposed change: ${proposal.summary}`}
      sx={{ p: 2, listStyle: "none", bgcolor: "background.paper" }}
    >
      <Stack spacing={1.25}>
        <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>
          {proposal.summary}
        </Typography>
        {decidedLabel ? (
          <Stack spacing={1} role="status">
            <Chip
              size="small"
              color={decidedLabel.color}
              label={decidedLabel.label}
              sx={{ alignSelf: "flex-start" }}
            />
            {decided?.failureReason && (
              <Typography variant="body2" color="text.secondary">
                {decided.failureReason}
              </Typography>
            )}
          </Stack>
        ) : (
          <>
            <Typography variant="caption" color="text.secondary">
              Nothing has changed yet. Expires {formatShopDateTime(proposal.expiresAt)} IST.
            </Typography>
            <Stack direction="row" spacing={1}>
              {/* Plain buttons: this renders inside the question form. */}
              <Button
                size="small"
                variant="contained"
                startIcon={<CheckRoundedIcon />}
                disabled={decision.isPending}
                onClick={() => decision.mutate({ id: proposal.id, decision: "approve" })}
              >
                {decision.isPending && decision.variables.decision === "approve"
                  ? "Applying…"
                  : "Approve"}
              </Button>
              <Button
                size="small"
                startIcon={<CloseRoundedIcon />}
                disabled={decision.isPending}
                onClick={() => decision.mutate({ id: proposal.id, decision: "reject" })}
              >
                Reject
              </Button>
            </Stack>
            {decision.isError && (
              <Alert severity="error">
                {decision.error instanceof ApiClientError
                  ? decision.error.message
                  : "The decision could not be saved. Please try again."}
              </Alert>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
};
