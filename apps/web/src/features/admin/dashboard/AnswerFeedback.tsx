import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { rateShopAnswer, type AgentRunRating } from "./shop-assistant-api.js";

// Ratings are saved against the run log so weak answers can become eval cases.
export const AnswerFeedback = ({ runId }: { runId: string }) => {
  const [rating, setRating] = useState<AgentRunRating | null>(null);
  const [comment, setComment] = useState("");
  const feedbackMutation = useMutation({ mutationFn: rateShopAnswer, retry: false });
  const submit = (selected: AgentRunRating, note: string | null) =>
    feedbackMutation.mutate({ runId, rating: selected, comment: note });

  if (feedbackMutation.isSuccess) {
    return (
      <Typography variant="body2" color="text.secondary" role="status">
        Thanks — your feedback was saved to the assistant run log.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      <Stack
        direction="row"
        spacing={1}
        role="group"
        aria-label="Rate this answer"
        sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
      >
        <Typography variant="body2" sx={{ fontWeight: 650, mr: 0.5 }}>
          Was this answer helpful?
        </Typography>
        <Button
          size="small"
          variant={rating === "UP" ? "contained" : "outlined"}
          startIcon={<ThumbUpOutlinedIcon />}
          disabled={feedbackMutation.isPending}
          onClick={() => {
            setRating("UP");
            submit("UP", null);
          }}
        >
          Helpful
        </Button>
        <Button
          size="small"
          variant={rating === "DOWN" ? "contained" : "outlined"}
          color={rating === "DOWN" ? "secondary" : "primary"}
          startIcon={<ThumbDownOutlinedIcon />}
          disabled={feedbackMutation.isPending}
          aria-expanded={rating === "DOWN"}
          onClick={() => setRating("DOWN")}
        >
          Not helpful
        </Button>
      </Stack>
      {rating === "DOWN" && (
        // Not a <form>: this renders inside the question form, and a nested submit would
        // bubble up and start another paid briefing.
        <Stack spacing={1} role="group" aria-label="Explain what was wrong">
          <TextField
            size="small"
            label="What was wrong? (optional)"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              // Keep Enter from submitting the surrounding question form.
              event.preventDefault();
              submit("DOWN", comment.trim() || null);
            }}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            sx={{ bgcolor: "background.paper" }}
          />
          <Button
            size="small"
            variant="contained"
            disabled={feedbackMutation.isPending}
            onClick={() => submit("DOWN", comment.trim() || null)}
            sx={{ alignSelf: "flex-start" }}
          >
            Send feedback
          </Button>
        </Stack>
      )}
      {feedbackMutation.isError && (
        <Alert severity="error">Your feedback could not be saved. Please try again.</Alert>
      )}
    </Stack>
  );
};
