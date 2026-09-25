import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import { ApiClientError } from "../../lib/api-client.js";
import type { Product } from "../../types/catalog.js";
import { MAX_CART_ITEM_QUANTITY } from "../cart/cart-context.js";
import { useCart } from "../cart/use-cart.js";
import {
  draftOrderFromMessage,
  type OrderDraft,
  type OrderDraftLine,
} from "./order-assistant-api.js";

const MESSAGE_LIMIT = 300;

interface LineChoice {
  selected: boolean;
  variantId: string | null;
}

const initialChoices = (draft: OrderDraft): Record<string, LineChoice> =>
  Object.fromEntries(
    draft.lines.map((line) => [
      line.id,
      {
        selected: line.status === "READY" || line.status === "LIMITED",
        variantId: line.variantId,
      },
    ]),
  );

// Review step: nothing reaches the cart until the customer confirms each line.
const DraftReview = ({ draft, products }: { draft: OrderDraft; products: Product[] }) => {
  const { addItem, items } = useCart();
  const [choices, setChoices] = useState(() => initialChoices(draft));
  const [result, setResult] = useState<{ added: number; skipped: string[] } | null>(null);
  const setChoice = (id: string, next: Partial<LineChoice>) =>
    setChoices((current) => ({ ...current, [id]: { ...current[id]!, ...next } }));

  const chosen = draft.lines.flatMap((line) => {
    const choice = choices[line.id];
    return choice?.selected && choice.variantId ? [{ line, variantId: choice.variantId }] : [];
  });
  const chosenUnits = chosen.reduce((sum, { line }) => sum + line.quantity, 0);

  const addToCart = () => {
    let added = 0;
    const skipped: string[] = [];
    for (const { line, variantId } of chosen) {
      // Price, SKU and stock come from the menu data, never from the assistant.
      const product = products.find((candidate) => candidate.id === line.productId);
      const variant = product?.variants.find((candidate) => candidate.id === variantId);
      if (!product || !variant || !variant.isAvailable || variant.stockQuantity === 0) {
        skipped.push(line.productName);
        continue;
      }
      const inCart = items.find((item) => item.variantId === variant.id)?.quantity ?? 0;
      const room = Math.min(variant.stockQuantity, MAX_CART_ITEM_QUANTITY) - inCart;
      const quantity = Math.min(line.quantity, Math.max(room, 0));
      if (quantity < line.quantity) skipped.push(`${product.name} (${variant.name})`);
      for (let unit = 0; unit < quantity; unit += 1) {
        addItem({
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          variantName: variant.name,
          sku: variant.sku,
          unitPrice: variant.price,
          stockQuantity: variant.stockQuantity,
        });
      }
      added += quantity;
    }
    setResult({ added, skipped });
  };

  if (draft.lines.length === 0) {
    return (
      <Alert severity="info">
        {draft.notFound.length > 0
          ? `We couldn't find ${draft.notFound.join(", ")} on our menu.`
          : "We couldn't find any menu items in that message. Try naming a dish or drink."}
      </Alert>
    );
  }

  return (
    <Stack spacing={1.5}>
      <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 750 }}>
        Check your order
      </Typography>
      <Stack component="ul" spacing={1} sx={{ p: 0, m: 0, listStyle: "none" }}>
        {draft.lines.map((line) => (
          <DraftLine
            key={line.id}
            line={line}
            choice={choices[line.id]!}
            onChange={(next) => setChoice(line.id, next)}
          />
        ))}
      </Stack>
      {draft.notFound.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          Not on our menu: {draft.notFound.join(", ")}
        </Typography>
      )}
      {result ? (
        <Alert
          severity={result.added > 0 ? "success" : "warning"}
          action={
            result.added > 0 ? (
              <Button component={RouterLink} to="/cart" color="inherit" size="small">
                View cart
              </Button>
            ) : undefined
          }
        >
          {result.added > 0 ? `Added ${result.added} to your cart.` : "Nothing was added."}
          {result.skipped.length > 0 &&
            ` Some items couldn't be added in full: ${result.skipped.join(", ")}.`}
        </Alert>
      ) : (
        <Button
          variant="contained"
          disabled={chosenUnits === 0}
          onClick={addToCart}
          sx={{ alignSelf: "flex-start" }}
        >
          {chosenUnits === 0
            ? "Choose items to add"
            : `Add ${chosenUnits} ${chosenUnits === 1 ? "item" : "items"} to cart`}
        </Button>
      )}
    </Stack>
  );
};

const DraftLine = ({
  line,
  choice,
  onChange,
}: {
  line: OrderDraftLine;
  choice: LineChoice;
  onChange(next: Partial<LineChoice>): void;
}) => {
  const soldOut = line.status === "SOLD_OUT";
  const size = line.sizeOptions.find((option) => option.variantId === choice.variantId)?.name;
  const label = `${line.quantity} × ${line.productName}${
    (size ?? line.variantName) ? ` (${size ?? line.variantName})` : ""
  }`;

  return (
    <Box component="li">
      <FormControlLabel
        control={
          <Checkbox
            checked={choice.selected && !soldOut}
            disabled={soldOut || !choice.variantId}
            onChange={(event) => onChange({ selected: event.target.checked })}
          />
        }
        label={label}
        sx={{ mr: 0 }}
      />
      {line.message && (
        <Typography
          variant="body2"
          color={soldOut ? "text.secondary" : "warning.dark"}
          sx={{ pl: 4 }}
        >
          {line.message}
        </Typography>
      )}
      {line.status === "CHOOSE_SIZE" && (
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          role="group"
          aria-label={`Size for ${line.productName}`}
          sx={{ pl: 4, pt: 0.75, flexWrap: "wrap" }}
        >
          {line.sizeOptions.map((option) => (
            <Chip
              key={option.variantId}
              label={option.name}
              clickable
              color={choice.variantId === option.variantId ? "primary" : "default"}
              variant={choice.variantId === option.variantId ? "filled" : "outlined"}
              aria-pressed={choice.variantId === option.variantId}
              onClick={() => onChange({ variantId: option.variantId, selected: true })}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
};

export const OrderChatAssistant = ({ products }: { products: Product[] }) => {
  const [message, setMessage] = useState("");
  const draftMutation = useMutation({ mutationFn: draftOrderFromMessage, retry: false });

  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby="order-chat-title"
      sx={{ p: { xs: 2, sm: 2.5 }, mb: 3 }}
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          <ChatBubbleOutlineRoundedIcon color="primary" />
          <Box>
            <Typography id="order-chat-title" component="h2" variant="h6" sx={{ fontWeight: 850 }}>
              Order by message
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Tell us what you'd like. You'll check everything before it goes in your cart.
            </Typography>
          </Box>
        </Stack>
        <Stack
          component="form"
          spacing={1.5}
          onSubmit={(event) => {
            event.preventDefault();
            if (message.trim() && !draftMutation.isPending) draftMutation.mutate(message.trim());
          }}
        >
          <TextField
            label="What would you like?"
            placeholder="e.g. two filter coffees and a masala dosa"
            multiline
            minRows={2}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              draftMutation.reset();
            }}
            helperText={`${message.length} / ${MESSAGE_LIMIT}`}
            slotProps={{ htmlInput: { maxLength: MESSAGE_LIMIT } }}
          />
          <Button
            type="submit"
            variant="outlined"
            disabled={!message.trim() || draftMutation.isPending}
            sx={{ alignSelf: "flex-start" }}
          >
            {draftMutation.isPending ? "Reading your order…" : "Build my order"}
          </Button>
        </Stack>
        <Box aria-live="polite">
          {draftMutation.isError && (
            <Alert severity="error">
              {draftMutation.error instanceof ApiClientError
                ? draftMutation.error.message
                : "We couldn't read that order. Please try again."}
            </Alert>
          )}
          {draftMutation.data && (
            // Keyed so a new draft starts with fresh choices.
            <DraftReview
              key={draftMutation.submittedAt}
              draft={draftMutation.data}
              products={products}
            />
          )}
        </Box>
      </Stack>
    </Paper>
  );
};
