import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Navigate, useOutletContext } from "react-router-dom";

import type { StaffUser } from "../../../types/auth.js";
import { formatShopDateTime } from "../../orders/order-format.js";
import {
  getAgentRuns,
  type AgentRun,
  type AgentRunFilters,
  type AgentRunOutcome,
} from "../dashboard/shop-assistant-api.js";

const agentRunsQuery = (filters: AgentRunFilters) =>
  queryOptions({
    queryKey: ["admin", "agent", "runs", filters],
    queryFn: ({ signal }) => getAgentRuns(filters, signal),
  });

const OUTCOME_COLOR: Record<AgentRunOutcome, "success" | "warning" | "error"> = {
  ANSWERED: "success",
  BLOCKED: "warning",
  FAILED: "error",
};

const formatSeconds = (milliseconds: number) => `${(milliseconds / 1000).toFixed(1)} s`;
const formatCount = new Intl.NumberFormat("en-IN").format;

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

const describeNote = ({
  id,
  keywordScore,
  similarity,
  score,
}: AgentRun["trace"]["retrievedKnowledge"][number]) => {
  const keyword = keywordScore ?? score;
  const parts = [
    ...(keyword === undefined || keyword === null ? [] : [`keyword ${keyword}`]),
    ...(similarity === undefined || similarity === null ? [] : [`vector ${similarity.toFixed(2)}`]),
  ];
  return parts.length ? `${id} · ${parts.join(" · ")}` : id;
};

const StatTile = ({ label, value }: { label: string; value: string }) => (
  <Paper variant="outlined" sx={{ p: 2, flex: "1 1 150px" }}>
    <Typography variant="caption" color="text.secondary" component="p">
      {label}
    </Typography>
    <Typography variant="h5" component="p" sx={{ fontVariantNumeric: "tabular-nums" }}>
      {value}
    </Typography>
  </Paper>
);

const TraceSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Box>
    <Typography component="h3" variant="subtitle2" sx={{ mb: 0.5 }}>
      {title}
    </Typography>
    {children}
  </Box>
);

const RunDetails = ({ run }: { run: AgentRun }) => (
  <Stack spacing={2}>
    {run.answer && (
      <TraceSection title="Answer">
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {run.answer}
        </Typography>
      </TraceSection>
    )}
    {run.failureReason && <Alert severity="error">{run.failureReason}</Alert>}
    {run.feedback?.comment && (
      <TraceSection title="Admin feedback">
        <Typography variant="body2">{run.feedback.comment}</Typography>
      </TraceSection>
    )}
    <TraceSection title="1 · Retrieval">
      {run.trace.retrieval && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
          {run.trace.retrieval.mode === "hybrid" ? "Hybrid (keyword + vector)" : "Keyword only"} ·{" "}
          {formatSeconds(run.trace.retrieval.durationMs)}
          {run.trace.retrieval.embeddingTokens > 0 &&
            ` · ${formatCount(run.trace.retrieval.embeddingTokens)} embedding tokens`}
          {run.trace.retrieval.fallbackReason && ` · ${run.trace.retrieval.fallbackReason}`}
        </Typography>
      )}
      {run.trace.retrievedKnowledge.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No reference notes matched.
        </Typography>
      ) : (
        <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
          {run.trace.retrievedKnowledge.map((note) => (
            <Chip key={note.id} size="small" variant="outlined" label={describeNote(note)} />
          ))}
        </Stack>
      )}
    </TraceSection>
    <TraceSection title="2 · Model and tool steps">
      {run.trace.modelCalls.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No model request — the question guardrail answered directly.
        </Typography>
      ) : (
        <Box component="ol" sx={{ pl: 2.5, my: 0, "& li": { mb: 0.5 } }}>
          {run.trace.modelCalls.map((call, index) => (
            <Fragment key={`model-${index}`}>
              <Typography component="li" variant="body2">
                Model request {index + 1}: {formatSeconds(call.durationMs)}
                {call.inputTokens !== null &&
                  ` · ${formatCount(call.inputTokens)} in / ${formatCount(call.outputTokens ?? 0)} out tokens`}
                {call.requestedTools.length > 0 && ` · asked for ${call.requestedTools.join(", ")}`}
                {!call.ok && " · failed"}
              </Typography>
              {/* Live tools run between the first and second model requests. */}
              {index === 0 &&
                run.trace.toolCalls.map((tool) => (
                  <Typography component="li" variant="body2" key={tool.name}>
                    Tool {tool.name}: {formatSeconds(tool.durationMs)}
                    {tool.ok ? "" : " · failed"}
                  </Typography>
                ))}
            </Fragment>
          ))}
        </Box>
      )}
    </TraceSection>
    <Typography variant="caption" color="text.secondary">
      Cited sources available: {run.sourceIds.length > 0 ? run.sourceIds.join(", ") : "none"}
      {run.model ? ` · Model ${run.model}` : ""}
    </Typography>
  </Stack>
);

const AgentRunLog = () => {
  const [filters, setFilters] = useState<AgentRunFilters>({ outcome: "ALL", rating: "ALL" });
  const runsQuery = useQuery(agentRunsQuery(filters));
  const runs = runsQuery.data ?? [];
  const rated = runs.filter((run) => run.feedback);
  const helpful = rated.filter((run) => run.feedback?.rating === "UP").length;
  const medianDuration = median(
    runs.filter((run) => run.outcome === "ANSWERED").map((run) => run.totalDurationMs),
  );
  const totalTokens = runs.reduce((sum, run) => sum + run.inputTokens + run.outputTokens, 0);

  return (
    <Box component="main" sx={{ py: { xs: 4, md: 6 } }}>
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: { md: "flex-end" } }}
        >
          <Box>
            <Typography variant="overline" color="secondary.dark">
              Shop assistant
            </Typography>
            <Typography component="h1" variant="h3">
              Assistant runs
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75 }}>
              What the assistant retrieved, which tools it used, how long it took and how admins
              rated it. Runs are kept for 90 days.
            </Typography>
          </Box>
          <Button
            startIcon={<RefreshRoundedIcon />}
            onClick={() => void runsQuery.refetch()}
            disabled={runsQuery.isFetching}
          >
            Refresh
          </Button>
        </Stack>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ my: { xs: 2.5, md: 3 } }}
        >
          <TextField
            select
            size="small"
            label="Outcome"
            value={filters.outcome}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                outcome: event.target.value as AgentRunFilters["outcome"],
              }))
            }
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="ALL">All outcomes</MenuItem>
            <MenuItem value="ANSWERED">Answered</MenuItem>
            <MenuItem value="BLOCKED">Blocked by guardrail</MenuItem>
            <MenuItem value="FAILED">Failed</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Feedback"
            value={filters.rating}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                rating: event.target.value as AgentRunFilters["rating"],
              }))
            }
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="ALL">All feedback</MenuItem>
            <MenuItem value="UP">Helpful</MenuItem>
            <MenuItem value="DOWN">Not helpful</MenuItem>
            <MenuItem value="UNRATED">Not rated</MenuItem>
          </TextField>
        </Stack>

        {runsQuery.isPending && (
          <Stack role="status" direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <CircularProgress size={18} />
            <Typography variant="body2">Loading assistant runs…</Typography>
          </Stack>
        )}
        {runsQuery.isError && (
          <Alert
            severity="error"
            action={<Button onClick={() => void runsQuery.refetch()}>Try again</Button>}
          >
            Assistant runs could not be loaded.
          </Alert>
        )}
        {runsQuery.isSuccess && (
          <Stack spacing={2.5}>
            <Stack
              direction="row"
              useFlexGap
              spacing={1.5}
              sx={{ flexWrap: "wrap" }}
              aria-label="Summary of the runs shown"
            >
              <StatTile label="Runs shown (latest 50)" value={formatCount(runs.length)} />
              <StatTile
                label="Rated helpful"
                value={rated.length ? `${helpful} of ${rated.length}` : "No ratings"}
              />
              <StatTile
                label="Median answer time"
                value={medianDuration === null ? "—" : formatSeconds(medianDuration)}
              />
              <StatTile label="Tokens used" value={formatCount(totalTokens)} />
            </Stack>
            {runs.length === 0 ? (
              <Alert severity="info">No assistant runs match these filters yet.</Alert>
            ) : (
              <Box>
                {runs.map((run) => (
                  <Accordion key={run.id} disableGutters variant="outlined">
                    <AccordionSummary
                      expandIcon={<ExpandMoreRoundedIcon />}
                      aria-controls={`run-${run.id}-details`}
                      id={`run-${run.id}-summary`}
                    >
                      <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 650, overflowWrap: "anywhere" }}>
                          {run.question}
                        </Typography>
                        <Stack
                          direction="row"
                          useFlexGap
                          spacing={1}
                          sx={{ alignItems: "center", flexWrap: "wrap" }}
                        >
                          <Chip
                            size="small"
                            color={OUTCOME_COLOR[run.outcome]}
                            variant="outlined"
                            label={run.outcome.toLowerCase()}
                          />
                          {run.feedback && (
                            <Chip
                              size="small"
                              color={run.feedback.rating === "UP" ? "success" : "error"}
                              label={run.feedback.rating === "UP" ? "Helpful" : "Not helpful"}
                            />
                          )}
                          <Typography variant="caption" color="text.secondary">
                            {formatShopDateTime(run.createdAt)} IST ·{" "}
                            {formatSeconds(run.totalDurationMs)} ·{" "}
                            {formatCount(run.inputTokens + run.outputTokens)} tokens
                          </Typography>
                        </Stack>
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails id={`run-${run.id}-details`}>
                      <RunDetails run={run} />
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Box>
            )}
          </Stack>
        )}
      </Container>
    </Box>
  );
};

export const AdminAgentRunsPage = () => {
  const { user } = useOutletContext<{ user: StaffUser }>();

  return user.role === "ADMIN" ? <AgentRunLog /> : <Navigate to="/admin" replace />;
};
