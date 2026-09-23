import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { ApiClientError } from "../../../lib/api-client.js";
import {
  ADMIN_KNOWLEDGE_QUERY_KEY,
  createKnowledgeNote,
  updateKnowledgeNote,
  type KnowledgeNote,
} from "./knowledge-api.js";

const CONTENT_LIMIT = 2_000;
const noteFormSchema = z.object({
  title: z.string().trim().min(1, "Enter a title").max(120),
  content: z
    .string()
    .trim()
    .min(20, "Write at least 20 characters")
    .max(CONTENT_LIMIT, `Keep the note within ${CONTENT_LIMIT} characters`),
  keywords: z
    .string()
    .max(900)
    .refine(
      (value) => value.split(",").filter((keyword) => keyword.trim()).length <= 20,
      "Use at most 20 keywords",
    ),
  isActive: z.boolean(),
});
type NoteFormValues = z.infer<typeof noteFormSchema>;

const toKeywords = (value: string) =>
  value
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);

export const KnowledgeNoteDialog = ({
  note,
  onClose,
}: {
  note: KnowledgeNote | null;
  onClose(): void;
}) => {
  const queryClient = useQueryClient();
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: {
      title: note?.title ?? "",
      content: note?.content ?? "",
      keywords: note?.keywords.join(", ") ?? "",
      isActive: note?.isActive ?? true,
    },
  });
  const content = useWatch({ control, name: "content" });
  const saveMutation = useMutation({
    mutationFn: (values: NoteFormValues) => {
      const input = { ...values, keywords: toKeywords(values.keywords) };
      return note ? updateKnowledgeNote(note.slug, input) : createKnowledgeNote(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_KNOWLEDGE_QUERY_KEY });
      onClose();
    },
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="knowledge-note-title">
      <form onSubmit={(event) => void handleSubmit((values) => saveMutation.mutate(values))(event)}>
        <DialogTitle id="knowledge-note-title">
          {note ? "Edit knowledge note" : "New knowledge note"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Alert severity="info">
              The assistant uses notes as evidence for answers. Write confirmed facts only; saving
              re-embeds the note so it can be found by meaning as well as by keywords.
            </Alert>
            <TextField
              label="Title"
              {...register("title")}
              error={Boolean(errors.title)}
              helperText={
                errors.title?.message ??
                (note
                  ? `Identifier: ${note.slug} (does not change)`
                  : "Also used to create the note's identifier.")
              }
              slotProps={{ htmlInput: { maxLength: 120 } }}
            />
            <TextField
              label="Content"
              multiline
              minRows={6}
              maxRows={14}
              {...register("content")}
              error={Boolean(errors.content)}
              helperText={
                errors.content?.message ?? `${content.length} / ${CONTENT_LIMIT} characters`
              }
              slotProps={{ htmlInput: { maxLength: CONTENT_LIMIT } }}
            />
            <TextField
              label="Keywords"
              {...register("keywords")}
              error={Boolean(errors.keywords)}
              helperText={
                errors.keywords?.message ??
                "Comma-separated words customers or staff might use, e.g. upi, cash, card"
              }
            />
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={field.value}
                      onChange={(event) => field.onChange(event.target.checked)}
                    />
                  }
                  label="Active — the assistant can retrieve this note"
                />
              )}
            />
            {saveMutation.isError && (
              <Alert severity="error">
                {saveMutation.error instanceof ApiClientError
                  ? saveMutation.error.message
                  : "The note could not be saved. Please try again."}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saveMutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save note"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
