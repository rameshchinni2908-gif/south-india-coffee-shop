import MicRoundedIcon from "@mui/icons-material/MicRounded";
import StopCircleRoundedIcon from "@mui/icons-material/StopCircleRounded";
import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import type { Product } from "../../types/catalog.js";
import { MAX_CART_ITEM_QUANTITY, type NewCartItem } from "../cart/cart-context.js";
import { useCart } from "../cart/use-cart.js";

interface SpeechRecognitionEventLike extends Event {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const getRecognition = (): SpeechRecognitionLike | null => {
  const windowWithSpeech = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  const Constructor =
    windowWithSpeech.SpeechRecognition ?? windowWithSpeech.webkitSpeechRecognition;
  return Constructor ? new Constructor() : null;
};

const quantityWords: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

const normalise = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const readQuantity = (text: string): number => {
  const match = text.match(/(?:^|\s)(\d+|a|an|one|two|three|four|five)\s*$/i);
  if (!match) return 1;
  const token = match[1];
  if (!token) return 1;
  return Math.min(Number(token) || quantityWords[token.toLowerCase()] || 1, MAX_CART_ITEM_QUANTITY);
};

const findVoiceItems = (transcript: string, products: Product[]): NewCartItem[] => {
  const spoken = normalise(transcript);
  const matches: Array<{ start: number; item: NewCartItem; quantity: number }> = [];

  for (const product of products) {
    let matched = false;
    for (const variant of product.variants) {
      if (!variant.isAvailable || variant.stockQuantity === 0) continue;
      const phrase = normalise(`${product.name} ${variant.name}`);
      const start = spoken.indexOf(phrase);
      if (start < 0) continue;
      matches.push({
        start,
        quantity: readQuantity(spoken.slice(Math.max(0, start - 18), start)),
        item: {
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          variantName: variant.name,
          sku: variant.sku,
          unitPrice: variant.price,
          stockQuantity: variant.stockQuantity,
        },
      });
      matched = true;
      break;
    }
    if (matched) continue;
    const productPhrase = normalise(product.name);
    const productStart = spoken.indexOf(productPhrase);
    const variant = product.variants.find(
      (candidate) => candidate.isAvailable && candidate.stockQuantity > 0,
    );
    if (productStart >= 0 && variant) {
      matches.push({
        start: productStart,
        quantity: readQuantity(spoken.slice(Math.max(0, productStart - 18), productStart)),
        item: {
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          variantName: variant.name,
          sku: variant.sku,
          unitPrice: variant.price,
          stockQuantity: variant.stockQuantity,
        },
      });
    }
  }

  return matches
    .sort((left, right) => left.start - right.start)
    .flatMap(({ item, quantity }) => Array.from({ length: quantity }, () => item));
};

export const VoiceOrderAssistant = ({ products }: { products: Product[] }) => {
  const { addItem, items } = useCart();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition);
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const startListening = () => {
    const recognition = getRecognition();
    if (!recognition) {
      setMessage(
        "Voice ordering is not supported in this browser. You can use the menu buttons instead.",
      );
      return;
    }
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const spoken = event.results[0]?.[0]?.transcript?.trim() ?? "";
      setTranscript(spoken);
      const voiceItems = findVoiceItems(spoken, products);
      if (voiceItems.length === 0) {
        setMessage(
          "I could not match that to an available size. Try saying ‘two filter coffee large’.",
        );
        return;
      }
      let added = 0;
      const addedByVariant = new Map<string, number>();
      for (const item of voiceItems) {
        const current =
          items.find((cartItem) => cartItem.variantId === item.variantId)?.quantity ?? 0;
        const alreadyAdded = addedByVariant.get(item.variantId) ?? 0;
        if (current + alreadyAdded < Math.min(item.stockQuantity, MAX_CART_ITEM_QUANTITY)) {
          addItem(item);
          added += 1;
          addedByVariant.set(item.variantId, alreadyAdded + 1);
        }
      }
      const grouped = voiceItems.reduce<Record<string, number>>((result, item) => {
        const key = `${item.productName} ${item.variantName}`;
        result[key] = (result[key] ?? 0) + 1;
        return result;
      }, {});
      const summary = Object.entries(grouped)
        .map(([name, count]) => `${count} ${name}`)
        .join(", ");
      setMessage(
        added > 0
          ? `Added ${summary}. Review your cart, then enter pickup details to place the order.`
          : "Those items are already at their available quantity in your cart.",
      );
      window.speechSynthesis?.speak(
        new SpeechSynthesisUtterance(
          added > 0 ? `Added ${summary} to your cart.` : "Those items are already in your cart.",
        ),
      );
    };
    recognition.onerror = () => {
      setListening(false);
      setMessage("I could not hear that clearly. Please try again in a quiet place.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setMessage(
      "Listening… Say items and quantities, for example: two filter coffee large and one masala tea.",
    );
    setListening(true);
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        mt: 3,
        p: { xs: 2, sm: 2.5 },
        borderColor: "rgba(111,50,25,.18)",
        background: "linear-gradient(135deg, rgba(255,253,248,.98), rgba(248,234,214,.7))",
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 850 }}>
            Order by voice
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Speak your items and quantities. We’ll add them to your cart for review.
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          startIcon={listening ? <StopCircleRoundedIcon /> : <MicRoundedIcon />}
          onClick={listening ? stopListening : startListening}
          disabled={!supported}
          sx={{ minWidth: 170, flexShrink: 0 }}
        >
          {listening ? "Stop listening" : "Start voice order"}
        </Button>
      </Stack>
      {transcript && (
        <Typography variant="body2" sx={{ mt: 1.5, fontStyle: "italic" }}>
          “{transcript}”
        </Typography>
      )}
      {message && (
        <Alert
          severity={message.startsWith("Added") ? "success" : listening ? "info" : "warning"}
          sx={{ mt: 1.5 }}
        >
          {message}
        </Alert>
      )}
      {items.length > 0 && (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ mt: 1.5, alignItems: { sm: "center" } }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            Your cart currently has {items.reduce((total, item) => total + item.quantity, 0)}{" "}
            item(s). Prices and stock are checked again when you place the order.
          </Typography>
          <Button component={RouterLink} to="/cart" variant="outlined" size="small">
            Review cart
          </Button>
        </Stack>
      )}
    </Paper>
  );
};

export { findVoiceItems };
