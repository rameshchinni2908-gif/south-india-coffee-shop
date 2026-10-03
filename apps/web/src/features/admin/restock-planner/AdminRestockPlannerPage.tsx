import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useOutletContext, useSearchParams } from "react-router-dom";

import { ApiClientError } from "../../../lib/api-client.js";
import type { StaffUser } from "../../../types/auth.js";
import { PREP_BRIEF_QUERY_KEY } from "../dashboard/prep-brief-api.js";
import { ADMIN_PRODUCTS_QUERY_KEY } from "../products/admin-catalog-queries.js";
import {
  decideRestockPlan,
  getRestockPlan,
  getRestockPlannerStatus,
  RESTOCK_PLANNER_QUERY_KEY,
  startRestockPlan,
  type RestockPlan,
} from "./restock-planner-api.js";

const MAX_QUANTITY = 10_000;
const RESULT_CHIP = {
  APPLIED: { label: "Applied", color: "success" },
  FAILED: { label: "Not applied", color: "error" },
  SKIPPED: { label: "Skipped", color: "default" },
} as const;

const errorText = (error: unknown, fallback: string) =>
  error instanceof ApiClientError ? error.message : fallback;

// The paused LangGraph step: the admin edits and approves, then the graph resumes.
const ReviewStep = ({
  plan,
  onDecided,
}: {
  plan: RestockPlan;
  onDecided(plan: RestockPlan): void;
}) => {
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(plan.items.map((item) => [item.variantId, String(item.suggestedQuantity)])),
  );
  const [approved, setApproved] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(plan.items.map((item) => [item.variantId, true])),
  );
  const queryClient = useQueryClient();
  const decide = useMutation({
    mutationFn: decideRestockPlan,
    retry: false,
    onSuccess: (decidedPlan) => {
      onDecided(decidedPlan);
      // Applied restocks change stock, so refresh every screen that shows it.
      for (const queryKey of [PREP_BRIEF_QUERY_KEY, ADMIN_PRODUCTS_QUERY_KEY, ["products"]]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
  const decisions = plan.items.map((item) => {
    const quantity = Number(quantities[item.variantId]);
    return {
      variantId: item.variantId,
      quantity: approved[item.variantId] && Number.isInteger(quantity) ? quantity : 0,
    };
  });
  const invalid = plan.items.some((item) => {
    const quantity = Number(quantities[item.variantId]);
    return (
      approved[item.variantId] &&
      (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY)
    );
  });
  const approvedCount = decisions.filter((decision) => decision.quantity > 0).length;

  return (
    <Stack spacing={2}>
      {plan.summary && <Typography>{plan.summary}</Typography>}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label="Restock plan">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">Approve</TableCell>
              <TableCell>Item</TableCell>
              <TableCell align="right">In stock</TableCell>
              <TableCell align="right">Usual prep</TableCell>
              <TableCell align="right">Add</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {plan.items.map((item) => {
              const name = `${item.productName} (${item.variantName})`;
              return (
                <TableRow key={item.variantId}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={approved[item.variantId] ?? false}
                      onChange={(event) =>
                        setApproved((current) => ({
                          ...current,
                          [item.variantId]: event.target.checked,
                        }))
                      }
                      slotProps={{ input: { "aria-label": `Approve ${name}` } }}
                    />
                  </TableCell>
                  <TableCell sx={{ overflowWrap: "anywhere" }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>
                      {name}
                      {!item.isAvailable && (
                        <Chip size="small" label="Switched off" variant="outlined" sx={{ ml: 1 }} />
                      )}
                    </Typography>
                    {item.reason && (
                      <Typography variant="caption" color="text.secondary">
                        {item.reason}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{item.stockQuantity}</TableCell>
                  <TableCell align="right">{item.suggestedPrep}</TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      type="number"
                      value={quantities[item.variantId] ?? ""}
                      disabled={!approved[item.variantId]}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [item.variantId]: event.target.value,
                        }))
                      }
                      slotProps={{
                        htmlInput: {
                          min: 0,
                          max: MAX_QUANTITY,
                          step: 1,
                          "aria-label": `Units to add for ${name}`,
                        },
                      }}
                      sx={{ width: 96 }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {invalid && <Alert severity="warning">Use whole numbers from 0 to {MAX_QUANTITY}.</Alert>}
      {decide.isError && (
        <Alert severity="error">{errorText(decide.error, "The plan could not be applied.")}</Alert>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <Button
          variant="contained"
          disabled={invalid || decide.isPending}
          onClick={() => decide.mutate({ runId: plan.runId, decisions })}
        >
          {decide.isPending
            ? "Applying…"
            : approvedCount > 0
              ? `Apply ${approvedCount} approved ${approvedCount === 1 ? "item" : "items"}`
              : "Skip all"}
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Stock is added through audited proposals. An item is not applied if its stock changed after
        this plan was drafted.
      </Typography>
    </Stack>
  );
};

const ResultsStep = ({ plan }: { plan: RestockPlan }) => (
  <Stack component="ul" spacing={1} sx={{ p: 0, m: 0, listStyle: "none" }}>
    {plan.results.map((result) => (
      <Paper component="li" variant="outlined" key={result.variantId} sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
          <Chip
            size="small"
            color={RESULT_CHIP[result.status].color}
            label={RESULT_CHIP[result.status].label}
          />
          <Typography variant="body2">
            {result.productName} ({result.variantName})
            {result.status !== "SKIPPED" && ` +${result.quantity}`}
          </Typography>
        </Stack>
        {result.message && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {result.message}
          </Typography>
        )}
      </Paper>
    ))}
  </Stack>
);

const RestockPlanner = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const runId = searchParams.get("run");
  const statusQuery = useQuery({
    queryKey: [...RESTOCK_PLANNER_QUERY_KEY, "status"],
    queryFn: ({ signal }) => getRestockPlannerStatus(signal),
    retry: false,
  });
  const planQuery = useQuery({
    queryKey: [...RESTOCK_PLANNER_QUERY_KEY, "run", runId],
    queryFn: ({ signal }) => getRestockPlan(runId!, signal),
    enabled: Boolean(runId),
    retry: false,
  });
  const showPlan = (plan: RestockPlan) => {
    queryClient.setQueryData([...RESTOCK_PLANNER_QUERY_KEY, "run", plan.runId], plan);
    setSearchParams({ run: plan.runId });
  };
  const start = useMutation({ mutationFn: startRestockPlan, retry: false, onSuccess: showPlan });
  const plan = planQuery.data;

  return (
    <Box component="main" sx={{ py: { xs: 4, md: 6 } }}>
      <Container maxWidth="lg">
        <Stack spacing={3}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <AccountTreeOutlinedIcon color="primary" />
            <Box>
              <Typography variant="overline" color="secondary.dark">
                LangGraph workflow
              </Typography>
              <Typography component="h1" variant="h3">
                Restock planner
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                Drafts today's restock from the prep plan, waits for your approval, then applies
                only what you approve. You can leave and come back; the plan waits for a week.
              </Typography>
            </Box>
          </Stack>

          {statusQuery.isPending && (
            <Stack role="status" direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <CircularProgress size={18} aria-label="Loading restock planner" />
              <Typography variant="body2">Loading…</Typography>
            </Stack>
          )}
          {statusQuery.isError && <Alert severity="error">The planner could not be loaded.</Alert>}
          {statusQuery.data?.enabled === false && (
            <Alert severity="info">
              The restock planner is not enabled. Set RESTOCK_PLANNER_ENABLED=true on the API.
            </Alert>
          )}

          {statusQuery.data?.enabled && (
            <Stack spacing={2.5}>
              {(!runId || plan?.status !== "AWAITING_APPROVAL") && (
                <Button
                  variant={plan ? "outlined" : "contained"}
                  onClick={() => start.mutate()}
                  disabled={start.isPending}
                  sx={{ alignSelf: "flex-start" }}
                >
                  {start.isPending
                    ? "Drafting…"
                    : plan
                      ? "Start a new plan"
                      : "Draft today's restock plan"}
                </Button>
              )}
              {start.isError && (
                <Alert severity="error">
                  {errorText(start.error, "The plan could not be drafted.")}
                </Alert>
              )}
              {runId && planQuery.isPending && (
                <Stack role="status" direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                  <CircularProgress size={18} aria-label="Loading plan" />
                  <Typography variant="body2">Loading plan…</Typography>
                </Stack>
              )}
              {planQuery.isError && (
                <Alert severity="error">
                  {errorText(planQuery.error, "That plan could not be loaded.")}
                </Alert>
              )}
              {plan?.status === "NOTHING_TO_RESTOCK" && (
                <Alert severity="success">Nothing needs restocking for today's prep plan.</Alert>
              )}
              {plan?.status === "AWAITING_APPROVAL" && (
                <ReviewStep key={plan.runId} plan={plan} onDecided={showPlan} />
              )}
              {plan?.status === "COMPLETED" && <ResultsStep plan={plan} />}
            </Stack>
          )}
        </Stack>
      </Container>
    </Box>
  );
};

export const AdminRestockPlannerPage = () => {
  const { user } = useOutletContext<{ user: StaffUser }>();

  return user.role === "ADMIN" ? <RestockPlanner /> : <Navigate to="/admin" replace />;
};
