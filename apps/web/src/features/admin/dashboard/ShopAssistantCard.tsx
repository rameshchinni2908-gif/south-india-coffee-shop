import { zodResolver } from "@hookform/resolvers/zod";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiClientError } from "../../../lib/api-client.js";
import { formatShopDateTime } from "../../orders/order-format.js";
import { generateShopBriefing, getShopAssistantStatus } from "./shop-assistant-api.js";

const questionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Enter a question about your shop.")
    .max(500, "Keep your question within 500 characters."),
});

export const ShopAssistantCard = () => {
  const statusQuery = useQuery({
    queryKey: ["admin", "agent", "status"],
    queryFn: ({ signal }) => getShopAssistantStatus(signal),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const briefingMutation = useMutation({
    mutationFn: generateShopBriefing,
    retry: false,
    gcTime: 0,
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof questionSchema>>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      question: "How is the shop doing today? What should I check first?",
    },
  });
  const isGenerating = briefingMutation.isPending || isSubmitting;
  const errorMessage =
    briefingMutation.error instanceof ApiClientError
      ? briefingMutation.error.message
      : "The briefing could not be generated. Please try again.";
  const briefing = briefingMutation.data;

  return (
    <Paper
      component="section"
      aria-labelledby="shop-assistant-title"
      variant="outlined"
      sx={{
        p: { xs: 2.5, md: 3 },
        overflow: "hidden",
        background: "linear-gradient(135deg, #fffdf8 55%, #fbefdf 100%)",
      }}
    >
      <Stack spacing={2.5}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
          <Box
            sx={{
              display: "grid",
              placeItems: "center",
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: 3,
              bgcolor: "rgba(111, 50, 25, 0.09)",
              color: "primary.main",
            }}
          >
            <AutoAwesomeOutlinedIcon />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" variant="h5" id="shop-assistant-title">
              Shop assistant
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              A quick briefing on today’s orders, sales and low stock.
            </Typography>
          </Box>
        </Stack>

        {statusQuery.isPending && (
          <Stack role="status" direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <CircularProgress size={18} />
            <Typography variant="body2">Checking assistant availability…</Typography>
          </Stack>
        )}
        {statusQuery.isError && (
          <Alert
            severity="warning"
            action={<Button onClick={() => void statusQuery.refetch()}>Try again</Button>}
          >
            Assistant availability could not be checked.
          </Alert>
        )}
        {statusQuery.data?.enabled === false && (
          <Alert severity="info">
            The shop assistant is not available yet. Your dashboard reports are still ready to use.
          </Alert>
        )}
        {statusQuery.data?.enabled && (
          <Stack
            component="form"
            aria-label="Ask the shop assistant"
            spacing={2}
            onSubmit={(event) => {
              if (isGenerating) {
                event.preventDefault();
                return;
              }
              void handleSubmit(async ({ question }) => {
                try {
                  await briefingMutation.mutateAsync(question);
                } catch {
                  // The mutation error is displayed below; paid requests are never retried automatically.
                }
              })(event);
            }}
          >
            <TextField
              label="Ask about your shop"
              multiline
              minRows={2}
              maxRows={5}
              fullWidth
              disabled={isGenerating}
              {...register("question")}
              error={Boolean(errors.question)}
              helperText={
                errors.question?.message ??
                "Up to 500 characters. Each question starts a fresh briefing."
              }
              slotProps={{ htmlInput: { maxLength: 500 } }}
              sx={{ bgcolor: "background.paper", borderRadius: 2 }}
            />
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
            >
              <Typography variant="caption" color="text.secondary">
                Reads shop reports. Changes to your shop stay in your hands.
              </Typography>
              <Button
                type="submit"
                variant="contained"
                disabled={isGenerating}
                startIcon={
                  isGenerating ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <AutoAwesomeOutlinedIcon />
                  )
                }
                sx={{ flexShrink: 0 }}
              >
                {isGenerating ? "Preparing briefing…" : "Generate briefing"}
              </Button>
            </Stack>
            <Box aria-live="polite" aria-atomic="true">
              {isGenerating && (
                <Typography variant="body2" color="text.secondary" role="status">
                  Reviewing your question and preparing a fresh answer. This may take a moment.
                </Typography>
              )}
              {briefingMutation.isError && <Alert severity="error">{errorMessage}</Alert>}
              {briefing && (
                <Stack spacing={2} sx={{ pt: 1 }}>
                  <Divider />
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
                  >
                    <Typography component="h3" variant="h6">
                      Your shop briefing
                    </Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={briefing.usedShopData ? "Shop report used" : "General guidance"}
                    />
                  </Stack>
                  <Typography
                    component="div"
                    sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.8 }}
                  >
                    {briefing.answer}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {briefing.usedShopData ? "Report as of" : "Generated"}{" "}
                    {formatShopDateTime(briefing.generatedAt)} IST. AI can make mistakes; check
                    figures in your reports before acting.
                  </Typography>
                </Stack>
              )}
            </Box>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
};
