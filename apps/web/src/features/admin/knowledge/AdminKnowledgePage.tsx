import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ManageSearchRoundedIcon from "@mui/icons-material/ManageSearchRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import {
  Alert,
  Box,
  Button,
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
import { Navigate, useOutletContext } from "react-router-dom";

import { ApiClientError } from "../../../lib/api-client.js";
import type { StaffUser } from "../../../types/auth.js";
import {
  ADMIN_KNOWLEDGE_QUERY_KEY,
  embedPendingNotes,
  knowledgeNotesQuery,
  searchKnowledge,
  type EmbeddingStatus,
  type KnowledgeNote,
  type KnowledgeRetrievalStatus,
} from "./knowledge-api.js";
import { KnowledgeNoteDialog } from "./KnowledgeNoteDialog.js";

const EMBEDDING_LABEL: Record<
  EmbeddingStatus,
  { label: string; color: "success" | "warning" | "default" }
> = {
  CURRENT: { label: "Embedded", color: "success" },
  STALE: { label: "Needs re-embedding", color: "warning" },
  MISSING: { label: "Not embedded", color: "warning" },
  DISABLED: { label: "Keyword only", color: "default" },
};

const describeRetrieval = ({ embeddings, vectorSearch, model }: KnowledgeRetrievalStatus) =>
  embeddings
    ? `Hybrid retrieval: keywords + ${model} vectors (${vectorSearch === "atlas" ? "Atlas Vector Search" : "in-memory search"}), fused by rank.`
    : "Keyword retrieval only. Configure OPENAI_API_KEY on the API to enable vector search.";

const RetrievalTester = () => {
  const [question, setQuestion] = useState("");
  const searchMutation = useMutation({ mutationFn: searchKnowledge, retry: false });
  const result = searchMutation.data;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 } }}>
      <Stack spacing={2}>
        <Box>
          <Typography component="h2" variant="h6">
            Try retrieval
          </Typography>
          <Typography variant="body2" color="text.secondary">
            See which notes the assistant would receive for a question, and why. No answer is
            generated.
          </Typography>
        </Box>
        <Stack
          component="form"
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim()) searchMutation.mutate(question.trim());
          }}
        >
          <TextField
            size="small"
            label="Question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="e.g. Can customers pay with UPI?"
            slotProps={{ htmlInput: { maxLength: 500 } }}
            sx={{ flex: 1 }}
          />
          <Button
            type="submit"
            variant="outlined"
            startIcon={<ManageSearchRoundedIcon />}
            disabled={!question.trim() || searchMutation.isPending}
          >
            {searchMutation.isPending ? "Searching…" : "Search notes"}
          </Button>
        </Stack>
        {searchMutation.isError && (
          <Alert severity="error">
            {searchMutation.error instanceof ApiClientError
              ? searchMutation.error.message
              : "The search could not be completed."}
          </Alert>
        )}
        {result && (
          <Stack spacing={1.5} aria-live="polite">
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
            >
              <Chip
                size="small"
                color={result.mode === "hybrid" ? "success" : "default"}
                label={result.mode === "hybrid" ? "Hybrid search" : "Keyword search"}
              />
              {result.fallbackReason && (
                <Typography variant="caption" color="text.secondary">
                  {result.fallbackReason}
                </Typography>
              )}
            </Stack>
            {result.results.length === 0 ? (
              <Alert severity="info">
                No note matched. The assistant would answer without reference notes.
              </Alert>
            ) : (
              <TableContainer>
                <Table size="small" aria-label="Retrieved notes">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Note</TableCell>
                      <TableCell align="right">Keyword rank · score</TableCell>
                      <TableCell align="right">Vector rank · similarity</TableCell>
                      <TableCell align="right">Fused (RRF)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.results.map((row, index) => (
                      <TableRow key={row.slug}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell sx={{ overflowWrap: "anywhere" }}>{row.title}</TableCell>
                        <TableCell align="right">
                          {row.keyword ? `#${row.keyword.rank} · ${row.keyword.score}` : "—"}
                        </TableCell>
                        <TableCell align="right">
                          {row.vector
                            ? `#${row.vector.rank} · ${row.vector.similarity.toFixed(3)}`
                            : "—"}
                        </TableCell>
                        <TableCell align="right">{(row.fusedScore * 1000).toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
};

const NoteCard = ({ note, onEdit }: { note: KnowledgeNote; onEdit(): void }) => {
  const embedding = EMBEDDING_LABEL[note.embeddingStatus];
  return (
    <Paper variant="outlined" component="li" sx={{ p: 2, listStyle: "none" }}>
      <Stack spacing={1}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
              {note.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {note.slug}
            </Typography>
          </Box>
          <Button
            size="small"
            startIcon={<EditOutlinedIcon />}
            onClick={onEdit}
            aria-label={`Edit ${note.title}`}
          >
            Edit
          </Button>
        </Stack>
        <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
          {!note.isActive && <Chip size="small" label="Inactive" />}
          <Chip size="small" variant="outlined" color={embedding.color} label={embedding.label} />
          {note.keywords.slice(0, 8).map((keyword) => (
            <Chip key={keyword} size="small" variant="outlined" label={keyword} />
          ))}
        </Stack>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            overflowWrap: "anywhere",
          }}
        >
          {note.content}
        </Typography>
      </Stack>
    </Paper>
  );
};

const KnowledgeBase = () => {
  const queryClient = useQueryClient();
  const notesQuery = useQuery(knowledgeNotesQuery());
  const [editing, setEditing] = useState<KnowledgeNote | "new" | null>(null);
  const embedMutation = useMutation({
    mutationFn: embedPendingNotes,
    retry: false,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_KNOWLEDGE_QUERY_KEY }),
  });
  const notes = notesQuery.data?.notes ?? [];
  const pending = notes.filter(
    (note) =>
      note.isActive && (note.embeddingStatus === "MISSING" || note.embeddingStatus === "STALE"),
  ).length;

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
              Knowledge
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75 }}>
              Reference notes the assistant retrieves as evidence. Changes apply to the next
              question — no deployment needed.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            {pending > 0 && (
              <Button
                startIcon={<SyncRoundedIcon />}
                onClick={() => embedMutation.mutate()}
                disabled={embedMutation.isPending}
              >
                {embedMutation.isPending ? "Embedding…" : `Embed ${pending} pending`}
              </Button>
            )}
            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={() => setEditing("new")}
            >
              New note
            </Button>
          </Stack>
        </Stack>

        <Stack spacing={3} sx={{ mt: { xs: 2.5, md: 3 } }}>
          {notesQuery.data && (
            <Typography variant="body2" color="text.secondary">
              {describeRetrieval(notesQuery.data.retrieval)}
            </Typography>
          )}
          {embedMutation.isError && (
            <Alert severity="error">
              {embedMutation.error instanceof ApiClientError
                ? embedMutation.error.message
                : "Notes could not be embedded."}
            </Alert>
          )}
          <RetrievalTester />
          {notesQuery.isPending && (
            <Stack role="status" direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <CircularProgress size={18} />
              <Typography variant="body2">Loading notes…</Typography>
            </Stack>
          )}
          {notesQuery.isError && (
            <Alert
              severity="error"
              action={<Button onClick={() => void notesQuery.refetch()}>Try again</Button>}
            >
              Knowledge notes could not be loaded.
            </Alert>
          )}
          {notesQuery.isSuccess && (
            <Box>
              <Typography component="h2" variant="h6" sx={{ mb: 1.5 }}>
                Notes ({notes.length})
              </Typography>
              <Box
                component="ul"
                sx={{
                  display: "grid",
                  gap: 1.5,
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  p: 0,
                  m: 0,
                }}
              >
                {notes.map((note) => (
                  <NoteCard key={note.slug} note={note} onEdit={() => setEditing(note)} />
                ))}
              </Box>
            </Box>
          )}
        </Stack>
      </Container>
      {editing && (
        <KnowledgeNoteDialog
          note={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Box>
  );
};

export const AdminKnowledgePage = () => {
  const { user } = useOutletContext<{ user: StaffUser }>();

  return user.role === "ADMIN" ? <KnowledgeBase /> : <Navigate to="/admin" replace />;
};
