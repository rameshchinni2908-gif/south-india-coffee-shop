import MicRoundedIcon from "@mui/icons-material/MicRounded";
import StopCircleRoundedIcon from "@mui/icons-material/StopCircleRounded";
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import type { Product } from "../../types/catalog.js";
import { MAX_CART_ITEM_QUANTITY, type NewCartItem } from "../cart/cart-context.js";
import { useCart } from "../cart/use-cart.js";

interface SpeechRecognitionEventLike extends Event {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onstart: (() => void) | null;
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
    .replace(/\bcopy\b/g, "coffee")
    .replace(/\bchai\b/g, "tea")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const readQuantity = (text: string): number => {
  const match = text.match(/(?:^|\s)(\d+|a|an|one|two|three|four|five)\s*$/i);
  if (!match) return 1;
  const token = match[1];
  if (!token) return 1;
  return Math.min(Number(token) || quantityWords[token.toLowerCase()] || 1, MAX_CART_ITEM_QUANTITY);
};

interface VoiceOrderResult {
  items: NewCartItem[];
  unavailable: string[];
}

const findVoiceOrder = (transcript: string, products: Product[]): VoiceOrderResult => {
  const segments = normalise(transcript)
    .split(/\s+(?:and|plus)\s+|,\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const matches: Array<{ start: number; item: NewCartItem; quantity: number }> = [];
  const unavailable: string[] = [];

  for (const [segmentIndex, segment] of segments.entries()) {
    let matched = false;
    for (const product of products) {
      for (const variant of product.variants) {
        const phrase = normalise(`${product.name} ${variant.name}`);
        const start = segment.indexOf(phrase);
        if (start < 0) continue;
        const quantity = readQuantity(segment.slice(Math.max(0, start - 18), start));
        if (!variant.isAvailable || variant.stockQuantity === 0) {
          unavailable.push(`${product.name} ${variant.name}`);
        } else {
          matches.push({
            start: segmentIndex + start,
            quantity,
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
        matched = true;
        break;
      }
      if (matched) break;
    }
    if (matched) continue;

    for (const product of products) {
      const productPhrase = normalise(product.name);
      const productStart = segment.indexOf(productPhrase);
      if (productStart < 0) continue;
      const requestedVariant = product.variants.find((variant) =>
        segment.includes(normalise(variant.name)),
      );
      const variant = requestedVariant ?? product.variants[0];
      if (!variant) break;
      const requestedSize = segment.match(/\b(regular|large|small|medium)\b/i)?.[1];
      if (!requestedVariant && requestedSize) {
        unavailable.push(`${product.name} ${requestedSize}`);
        matched = true;
        break;
      }
      const quantity = readQuantity(segment.slice(Math.max(0, productStart - 18), productStart));
      if (!variant.isAvailable || variant.stockQuantity === 0) {
        unavailable.push(`${product.name} ${variant.name}`);
      } else {
        matches.push({
          start: segmentIndex + productStart,
          quantity,
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
      matched = true;
      break;
    }
    if (!matched) {
      const cleaned = segment
        .replace(/^(please\s+)?(?:order|get|give me|add)\s+/i, "")
        .replace(/^(\d+|a|an|one|two|three|four|five)\s+/i, "")
        .trim();
      if (cleaned) unavailable.push(cleaned);
    }
  }

  return {
    items: matches
      .sort((left, right) => left.start - right.start)
      .flatMap(({ item, quantity }) => Array.from({ length: quantity }, () => item)),
    unavailable,
  };
};

const findVoiceItems = (transcript: string, products: Product[]): NewCartItem[] =>
  findVoiceOrder(transcript, products).items;

const speak = (text: string) => {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-IN";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
};

export const VoiceOrderAssistant = ({ products }: { products: Product[] }) => {
  const { addItem, items } = useCart();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const manualStopRef = useRef(false);
  const microphoneGrantedRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [lastSpoken, setLastSpoken] = useState<string | null>(null);
  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition);
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const startListening = async () => {
    const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    if (!window.isSecureContext && !isLocalhost) {
      setMessage("Voice ordering requires HTTPS. Open the deployed HTTPS address, then try again.");
      return;
    }
    if (navigator.mediaDevices?.getUserMedia) {
      setMessage("Requesting microphone access…");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        microphoneGrantedRef.current = true;
      } catch (error) {
        const errorName = error instanceof DOMException ? error.name : "";
        setMessage(
          errorName === "NotAllowedError"
            ? "Microphone not allowed. Please allow microphone access and try again."
            : "Microphone could not be accessed. Check your microphone and try again.",
        );
        return;
      }
    }
    const recognition = getRecognition();
    if (!recognition) {
      setMessage(
        "Voice ordering is not supported in this browser. You can use the menu buttons instead.",
      );
      return;
    }
    const browserLanguage = navigator.language?.toLowerCase();
    recognition.lang = browserLanguage?.startsWith("en") ? navigator.language : "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const spoken = event.results[0]?.[0]?.transcript?.trim() ?? "";
      setTranscript(spoken);
      const result = findVoiceOrder(spoken, products);
      const voiceItems = result.items;
      const unavailableMessage = result.unavailable.length
        ? `Not available on the menu: ${result.unavailable.join(", ")}.`
        : "";
      if (voiceItems.length === 0) {
        const response =
          unavailableMessage ||
          "I could not match that to the menu. Please try a menu item and size.";
        setMessage(response);
        setLastSpoken(response);
        speak(response);
        return;
      }
      if (voiceItems.length === 0) {
        setMessage(
          "I could not match that to an available size. Try saying ‘two filter coffee large’.",
        );
        return;
      }
      let added = 0;
      const addedItems: NewCartItem[] = [];
      const requestedByVariant = new Map<string, { item: NewCartItem; quantity: number }>();
      for (const item of voiceItems) {
        const request = requestedByVariant.get(item.variantId);
        if (request) request.quantity += 1;
        else requestedByVariant.set(item.variantId, { item, quantity: 1 });
      }
      const validationMessages: string[] = [];
      for (const { item, quantity } of requestedByVariant.values()) {
        const current =
          items.find((cartItem) => cartItem.variantId === item.variantId)?.quantity ?? 0;
        const availableToAdd = Math.max(
          0,
          Math.min(item.stockQuantity, MAX_CART_ITEM_QUANTITY) - current,
        );
        if (quantity > availableToAdd) {
          validationMessages.push(
            availableToAdd > 0
              ? `Only ${availableToAdd} more ${item.productName} ${item.variantName} can be added.`
              : `${item.productName} ${item.variantName} is already at its available quantity in your cart.`,
          );
          continue;
        }
        for (let index = 0; index < quantity; index += 1) {
          addItem(item);
          addedItems.push(item);
          added += 1;
        }
      }
      const grouped = addedItems.reduce<Record<string, number>>((result, item) => {
        const key = `${item.productName} ${item.variantName}`;
        result[key] = (result[key] ?? 0) + 1;
        return result;
      }, {});
      const summary = Object.entries(grouped)
        .map(([name, count]) => `${count} ${name}`)
        .join(", ");
      const response = [
        added > 0 ? `Added ${summary} to your cart. Review it before checkout.` : "",
        unavailableMessage,
        ...validationMessages,
      ]
        .filter(Boolean)
        .join(" ");
      setMessage(response);
      setLastSpoken(response);
      speak(response);
    };
    recognition.onstart = () => {
      setListening(true);
    };
    recognition.onerror = (event) => {
      setListening(false);
      if (manualStopRef.current || event.error === "aborted") return;
      setMessage(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? microphoneGrantedRef.current
            ? "Voice recognition is unavailable right now. Please reload the page and try again."
            : "Microphone not allowed. Please allow microphone access and try again."
          : event.error === "no-speech"
            ? "No speech was detected. Tap the microphone and speak your order clearly."
            : "Voice input is temporarily unavailable. Please try again or use the menu buttons.",
      );
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    manualStopRef.current = false;
    setMessage(
      "Listening… Say items and quantities, for example: two filter coffee large and one masala tea.",
    );
    setListening(false);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setMessage("Voice input could not start. Please try again.");
    }
  };

  const stopListening = () => {
    manualStopRef.current = true;
    recognitionRef.current?.stop();
    setListening(false);
  };

  return (
    <Paper
      id="voice-order"
      variant="outlined"
      sx={{
        mt: 3,
        p: { xs: 2, sm: 2.5 },
        borderColor: "rgba(111,50,25,.18)",
        background: "linear-gradient(135deg, rgba(255,253,248,.98), rgba(248,234,214,.7))",
        scrollMarginTop: { xs: 76, sm: 96 },
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
      {!supported && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          Voice ordering needs a browser with speech recognition, such as Chrome on Android. You can
          still use the menu buttons on this device.
        </Alert>
      )}
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
      {lastSpoken && (
        <Button
          size="small"
          variant="text"
          startIcon={<VolumeUpRoundedIcon />}
          onClick={() => speak(lastSpoken)}
          sx={{ alignSelf: "flex-start", mt: 0.5 }}
        >
          Hear confirmation again
        </Button>
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
