import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import IosShareOutlinedIcon from "@mui/icons-material/IosShareOutlined";
import QrCode2OutlinedIcon from "@mui/icons-material/QrCode2Outlined";
import { Alert, Box, Button, Collapse, Paper, Stack, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";

import { GAME_DISPLAY_NAME, GAME_TAGLINE } from "./game-contract.js";

const QR_CANVAS_SIZE = 168;
const QR_QUIET_MODULES = 2;

interface RoomCodeShareProps {
  code: string;
  shareUrl: string;
  reducedMotion: boolean;
}

type CopyState = "idle" | "copied" | "failed";

const canUseWebShare = (): boolean =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";

export const RoomCodeShare = ({ code, shareUrl, reducedMotion }: RoomCodeShareProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [qrError, setQrError] = useState(false);

  const copyLink = useCallback(async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }, [shareUrl]);

  const shareLink = useCallback(async () => {
    try {
      await navigator.share({
        title: GAME_DISPLAY_NAME,
        text: `${GAME_TAGLINE} Room code ${code}.`,
        url: shareUrl,
      });
    } catch {
      // A cancelled share sheet is not an error worth surfacing.
    }
  }, [code, shareUrl]);

  useEffect(() => {
    if (copyState !== "copied") {
      return;
    }

    const timer = window.setTimeout(() => setCopyState("idle"), 2_400);

    return () => window.clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (!showQr) {
      return;
    }

    let cancelled = false;

    const draw = async () => {
      try {
        // Lazily imported so the QR generator never lands in the main chunk.
        const { default: qrcode } = await import("qrcode-generator");
        const canvas = canvasRef.current;

        if (cancelled || !canvas) {
          return;
        }

        const context = canvas.getContext("2d");

        if (!context) {
          setQrError(true);

          return;
        }

        const qr = qrcode(0, "M");
        qr.addData(shareUrl);
        qr.make();

        const modules = qr.getModuleCount();
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const total = modules + QR_QUIET_MODULES * 2;
        const cell = Math.floor((QR_CANVAS_SIZE * scale) / total);
        const pixelSize = cell * total;

        canvas.width = pixelSize;
        canvas.height = pixelSize;
        context.fillStyle = "#fffdf8";
        context.fillRect(0, 0, pixelSize, pixelSize);
        context.fillStyle = "#442012";

        for (let row = 0; row < modules; row += 1) {
          for (let column = 0; column < modules; column += 1) {
            if (qr.isDark(row, column)) {
              context.fillRect(
                (column + QR_QUIET_MODULES) * cell,
                (row + QR_QUIET_MODULES) * cell,
                cell,
                cell,
              );
            }
          }
        }

        setQrError(false);
      } catch {
        if (!cancelled) {
          setQrError(true);
        }
      }
    };

    void draw();

    return () => {
      cancelled = true;
    };
  }, [shareUrl, showQr]);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2.5, md: 3 },
        bgcolor: "background.paper",
        borderColor: "rgba(111, 50, 25, 0.18)",
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="overline" color="secondary.dark">
            Room code
          </Typography>
          <Typography
            component="p"
            sx={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontWeight: 700,
              fontSize: { xs: 46, sm: 56 },
              lineHeight: 1,
              letterSpacing: "0.16em",
              fontVariantNumeric: "tabular-nums",
              color: "primary.main",
            }}
          >
            {code}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            Read it out across the table, or send the link.
          </Typography>
        </Box>

        <Stack spacing={1} sx={{ width: { xs: "100%", sm: "auto" }, minWidth: { sm: 208 } }}>
          <Button
            variant="contained"
            startIcon={<ContentCopyOutlinedIcon />}
            onClick={() => void copyLink()}
          >
            {copyState === "copied" ? "Link copied" : "Copy link"}
          </Button>
          {canUseWebShare() ? (
            <Button
              variant="outlined"
              startIcon={<IosShareOutlinedIcon />}
              onClick={() => void shareLink()}
            >
              Share
            </Button>
          ) : null}
          <Button
            variant="outlined"
            startIcon={<QrCode2OutlinedIcon />}
            aria-expanded={showQr}
            aria-controls="kaapi-room-qr"
            onClick={() => setShowQr((current) => !current)}
          >
            {showQr ? "Hide QR" : "Show QR"}
          </Button>
        </Stack>
      </Stack>

      <Box aria-live="polite" sx={{ mt: copyState === "idle" ? 0 : 1.5 }}>
        {copyState === "copied" ? (
          <Alert severity="success" variant="outlined">
            Invite link copied to your clipboard.
          </Alert>
        ) : null}
        {copyState === "failed" ? (
          <Alert severity="warning" variant="outlined">
            Copying is blocked in this browser — share the link below instead.
          </Alert>
        ) : null}
      </Box>

      <Collapse in={showQr} timeout={reducedMotion ? 0 : 260} unmountOnExit>
        <Stack id="kaapi-room-qr" spacing={1.5} sx={{ mt: 2.5, alignItems: "center" }}>
          {qrError ? (
            <Alert severity="warning" variant="outlined" sx={{ width: "100%" }}>
              The QR code could not be drawn here. Use the link instead.
            </Alert>
          ) : (
            <Box
              component="canvas"
              ref={canvasRef}
              role="img"
              aria-label={`QR code that opens Kaapi Karts room ${code}`}
              sx={{
                width: QR_CANVAS_SIZE,
                height: QR_CANVAS_SIZE,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
              }}
            />
          )}
          <TextField
            label="Invite link"
            value={shareUrl}
            size="small"
            fullWidth
            slotProps={{ htmlInput: { readOnly: true, "aria-readonly": true } }}
          />
        </Stack>
      </Collapse>
    </Paper>
  );
};
