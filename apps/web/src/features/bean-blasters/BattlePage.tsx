import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { getArenaResult } from "./arena-api.js";
import {
  findArena,
  findBadgeColour,
  formatBadgeNumber,
  HEALTH,
  ROASTERY_FLOOR,
  ROOM_CODE_PATTERN,
  ROUND_MS,
} from "./arena-contract.js";
import { BEAN_BLASTERS_PATH, beanBlastersResultsPath } from "./arena-paths.js";
import { pulse } from "./arena-preferences.js";
import { ArenaErrorState } from "./ArenaStates.js";
import { BattleControls } from "./BattleControls.js";
import { BattleHud, type HudScoreRow } from "./BattleHud.js";
import { CountdownOverlay } from "./BattleCountdownOverlay.js";
import {
  createBattleEngine,
  type BattleEngine,
  type BattleHud as BattleHudSnapshot,
} from "./engine/index.js";
import { readPlayerId } from "./arena-player-identity.js";
import { useArenaSocket } from "./use-arena-socket.js";
import { useReducedMotion } from "./use-arena-reduced-motion.js";

const HUD_UPDATE_INTERVAL_MS = 90;
const SPLASH_BANNER_MS = 1_400;
const FALLBACK_COLOUR = "#715b50";

const INITIAL_HUD: BattleHudSnapshot = {
  hearts: HEALTH.startHearts,
  ammo: 0,
  reloading: false,
  reloadProgress: 0,
  remainingMs: ROUND_MS,
  hits: 0,
  downed: false,
  powerUp: null,
  powerUpRemainingMs: 0,
};

interface SplashBanner {
  readonly kind: "dealt" | "taken";
  readonly badgeNumber: number;
}

export const BattlePage = () => {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { code: codeParam } = useParams<{ code?: string }>();
  const code = (codeParam ?? "").toUpperCase();
  const isValidCode = ROOM_CODE_PATTERN.test(code);
  const [playerId] = useState(() => readPlayerId());

  const socket = useArenaSocket({ code: isValidCode ? code : null, playerId });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BattleEngine | null>(null);
  const startRef = useRef<number | null>(null);
  const endRef = useRef<number | null>(null);
  const hudUpdatedAtRef = useRef(0);
  // Widened explicitly: HEALTH is `as const`, so inferring from `startHearts`
  // would type `hearts` as the literal 3 and reject every later count.
  const hudUrgentRef = useRef<{ downed: boolean; hearts: number; reloading: boolean }>({
    downed: false,
    hearts: HEALTH.startHearts,
    reloading: false,
  });
  const colourByBadgeRef = useRef<Map<number, string>>(new Map());
  const knownGhostsRef = useRef<Set<number>>(new Set());
  const selfBadgeRef = useRef<number | null>(null);
  const clockOffsetRef = useRef(socket.serverClockOffsetMs);
  const sendPositionRef = useRef(socket.sendPosition);
  const sendFireRef = useRef(socket.sendFire);

  // Synced in an effect, not during render: the engine callbacks below only read
  // these after mount.
  useEffect(() => {
    sendPositionRef.current = socket.sendPosition;
    sendFireRef.current = socket.sendFire;
    clockOffsetRef.current = socket.serverClockOffsetMs;
  });

  const [hud, setHud] = useState<BattleHudSnapshot>(INITIAL_HUD);
  const [announcement, setAnnouncement] = useState("");
  const [splash, setSplash] = useState<SplashBanner | null>(null);
  const [countdownDone, setCountdownDone] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const room = socket.state;
  const players = useMemo(
    () => [...(room?.players ?? [])].sort((a, b) => a.badgeNumber - b.badgeNumber),
    [room],
  );
  const self = players.find((player) => player.playerId === playerId) ?? null;
  const arena = findArena(room?.arenaId ?? "") ?? ROASTERY_FLOOR;
  const selfColourHex = self ? (findBadgeColour(self.colour)?.hex ?? FALLBACK_COLOUR) : null;
  const spawnIndex = self ? Math.max(0, players.indexOf(self)) : 0;

  const roundStartsAtMs = room?.roundStartsAt ? Date.parse(room.roundStartsAt) : null;
  const roundEndsAtMs = room?.roundEndsAt ? Date.parse(room.roundEndsAt) : null;
  const localStartMs =
    roundStartsAtMs !== null && Number.isFinite(roundStartsAtMs)
      ? roundStartsAtMs + socket.serverClockOffsetMs
      : null;
  const localEndMs =
    roundEndsAtMs !== null && Number.isFinite(roundEndsAtMs)
      ? roundEndsAtMs + socket.serverClockOffsetMs
      : localStartMs !== null
        ? localStartMs + ROUND_MS
        : null;

  useEffect(() => {
    startRef.current = localStartMs;
    endRef.current = localEndMs;
  }, [localEndMs, localStartMs]);

  useEffect(() => {
    selfBadgeRef.current = self?.badgeNumber ?? null;
  }, [self]);

  // Derived during render so the scoreboard below can read it directly; the ref
  // exists only so the engine callbacks, which run outside render, see it too.
  const colourByBadge = useMemo(
    () =>
      new Map(
        players.map((player) => [
          player.badgeNumber,
          findBadgeColour(player.colour)?.hex ?? FALLBACK_COLOUR,
        ]),
      ),
    [players],
  );

  useEffect(() => {
    colourByBadgeRef.current = colourByBadge;
  }, [colourByBadge]);

  useEffect(() => {
    if (!splash) {
      return;
    }

    const timer = window.setTimeout(() => setSplash(null), SPLASH_BANNER_MS);

    return () => window.clearTimeout(timer);
  }, [splash]);

  const canMount = Boolean(self) && localStartMs !== null;
  const selfBadgeNumber = self?.badgeNumber ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    const startAt = startRef.current;
    const endAt = endRef.current;

    if (
      !canvas ||
      !canMount ||
      selfBadgeNumber === null ||
      !selfColourHex ||
      startAt === null ||
      endAt === null
    ) {
      return;
    }

    const engine = createBattleEngine({
      canvas,
      arena,
      selfBadgeNumber,
      selfColour: selfColourHex,
      spawnIndex,
      reducedMotion,
      // Fire-and-forget. The server validates cadence, ammo and origin drift and
      // owns every bean from here on — this is only a request (§7a).
      onFire: (payload) => sendFireRef.current(payload),
      onBroadcast: (pose) => sendPositionRef.current(pose),
      onHud: (next) => {
        const now = Date.now();

        // Heart and refill changes are the feedback players react to, so they
        // bypass the throttle that keeps the rest of the HUD cheap.
        const isUrgent =
          next.downed !== hudUrgentRef.current.downed ||
          next.hearts !== hudUrgentRef.current.hearts ||
          next.reloading !== hudUrgentRef.current.reloading;

        if (!isUrgent && now - hudUpdatedAtRef.current < HUD_UPDATE_INTERVAL_MS) {
          return;
        }

        hudUrgentRef.current = {
          downed: next.downed,
          hearts: next.hearts,
          reloading: next.reloading,
        };
        hudUpdatedAtRef.current = now;
        setHud(next);
      },
    });

    engineRef.current = engine;
    engine.mount(startAt, endAt);

    return () => {
      engine.destroy();
      engineRef.current = null;
      knownGhostsRef.current.clear();
    };
  }, [arena, canMount, reducedMotion, selfBadgeNumber, selfColourHex, spawnIndex]);

  useEffect(() => {
    const unsubscribe = socket.subscribeToGhosts((ghost) => {
      const engine = engineRef.current;

      if (!engine) {
        return;
      }

      knownGhostsRef.current.add(ghost.badgeNumber);
      engine.upsertGhost({
        ...ghost,
        colour: colourByBadgeRef.current.get(ghost.badgeNumber) ?? FALLBACK_COLOUR,
      });
    });

    return unsubscribe;
  }, [socket.subscribeToGhosts]);

  useEffect(
    () => socket.subscribeToShots((shot) => engineRef.current?.applyShot(shot)),
    [socket.subscribeToShots],
  );

  // Splash verdicts come from the server, never from local collision detection:
  // both phones would otherwise each decide they had landed the bean (§7a).
  useEffect(() => {
    const unsubscribe = socket.subscribeToHits((hit) => {
      const engine = engineRef.current;
      const myBadge = selfBadgeRef.current;

      engine?.applyHit(hit);

      if (myBadge === null) {
        return;
      }

      if (hit.shooterBadge === myBadge) {
        setSplash({ kind: "dealt", badgeNumber: hit.victimBadge });
        setAnnouncement(`You splashed badge ${formatBadgeNumber(hit.victimBadge)}.`);
        pulse(30);
      } else if (hit.victimBadge === myBadge) {
        setSplash({ kind: "taken", badgeNumber: hit.shooterBadge });
        setAnnouncement(
          hit.downed
            ? `Badge ${formatBadgeNumber(hit.shooterBadge)} splashed you. Refill break.`
            : `Badge ${formatBadgeNumber(hit.shooterBadge)} splashed you. ${hit.victimHearts} hearts left.`,
        );
        pulse([40, 40, 40]);
      }
    });

    return unsubscribe;
  }, [socket.subscribeToHits]);

  useEffect(
    () => socket.subscribeToRespawns((respawn) => engineRef.current?.applyRespawn(respawn)),
    [socket.subscribeToRespawns],
  );

  useEffect(
    () =>
      socket.subscribeToAmmo((payload) => {
        const reloadingUntil = payload.reloadingUntil ? Date.parse(payload.reloadingUntil) : null;

        engineRef.current?.applyAmmo(
          payload.ammo,
          reloadingUntil !== null && Number.isFinite(reloadingUntil)
            ? reloadingUntil + clockOffsetRef.current
            : null,
        );
      }),
    [socket.subscribeToAmmo],
  );

  useEffect(
    () => socket.subscribeToPads((pad) => engineRef.current?.applyPad(pad.padIndex, pad.kind)),
    [socket.subscribeToPads],
  );

  useEffect(
    () =>
      socket.subscribeToPowers((power) => {
        if (power.badgeNumber !== selfBadgeRef.current) {
          return;
        }

        const until = power.until ? Date.parse(power.until) : null;

        engineRef.current?.applyPower(
          power.kind,
          until !== null && Number.isFinite(until) ? until + clockOffsetRef.current : null,
        );
      }),
    [socket.subscribeToPowers],
  );

  useEffect(() => {
    const engine = engineRef.current;

    if (!engine) {
      return;
    }

    const present = new Set(players.map((player) => player.badgeNumber));

    for (const badgeNumber of Array.from(knownGhostsRef.current)) {
      if (!present.has(badgeNumber)) {
        engine.removeGhost(badgeNumber);
        knownGhostsRef.current.delete(badgeNumber);
      }
    }
  }, [players]);

  // Requested here rather than on the lobby so the screen stays lit for exactly
  // the countdown plus the round. Failing is fine — it is a nicety.
  useEffect(() => {
    let released = false;
    let sentinel: WakeLockSentinel | null = null;

    const request = async () => {
      try {
        if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
          return;
        }

        sentinel = await navigator.wakeLock.request("screen");

        if (released) {
          await sentinel.release();
          sentinel = null;
        }
      } catch {
        // Wake lock is unsupported on several browsers; the screen just dims.
      }
    };

    void request();

    return () => {
      released = true;
      void sentinel?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (socket.status !== "BATTLE") {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [socket.status]);

  const resultFallbackQuery = useQuery({
    queryKey: ["arena", "result", code],
    queryFn: ({ signal }) => getArenaResult(code, signal),
    enabled: isValidCode && socket.status === "RESULTS" && socket.results === null,
    retry: false,
    refetchInterval: 6_000,
  });

  const resultsAvailable = socket.results !== null || Boolean(resultFallbackQuery.data);

  useEffect(() => {
    if (resultsAvailable || socket.status === "RESULTS") {
      navigate(beanBlastersResultsPath(code), { replace: true });
    }
  }, [code, navigate, resultsAvailable, socket.status]);

  const handleMove = useCallback((dx: number, dy: number) => {
    engineRef.current?.setMove(dx, dy);
  }, []);

  const handleAim = useCallback((angle: number) => {
    engineRef.current?.setAim(angle);
  }, []);

  const handleFiring = useCallback((isFiring: boolean) => {
    engineRef.current?.setFiring(isFiring);
  }, []);

  const handleReload = useCallback(() => {
    engineRef.current?.requestReload();
    socket.requestReload();
  }, [socket]);

  const leaveBattle = () => {
    socket.leaveRoom();
    navigate(BEAN_BLASTERS_PATH, { replace: true });
  };

  const requestLeave = () => {
    if (socket.status === "BATTLE") {
      setShowLeaveConfirm(true);

      return;
    }

    leaveBattle();
  };

  if (!isValidCode) {
    return (
      <Box component="main" sx={{ py: 8, px: 3 }}>
        <ArenaErrorState
          title="That room code looks wrong"
          message="Room codes are four characters long and never use O, 0, I or 1."
          actionLabel="Back to Bean Blasters"
          onAction={() => navigate(BEAN_BLASTERS_PATH)}
        />
      </Box>
    );
  }

  const scoreboard: readonly HudScoreRow[] =
    socket.scores.length > 0
      ? [...socket.scores]
          .sort((a, b) => b.hits - a.hits || a.badgeNumber - b.badgeNumber)
          .map((score) => ({
            badgeNumber: score.badgeNumber,
            colourHex: colourByBadge.get(score.badgeNumber) ?? FALLBACK_COLOUR,
            hits: score.hits,
            isSelf: score.badgeNumber === selfBadgeNumber,
          }))
      : players.map((player) => ({
          badgeNumber: player.badgeNumber,
          colourHex: findBadgeColour(player.colour)?.hex ?? FALLBACK_COLOUR,
          hits: player.hits,
          isSelf: player.playerId === playerId,
        }));

  const showCountdown = localStartMs !== null && !countdownDone;
  const offline = socket.connection !== "connected" && socket.connection !== "idle";

  return (
    <Box
      component="main"
      sx={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        bgcolor: "#1e0f09",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <Box
        component="canvas"
        ref={canvasRef}
        role="img"
        aria-label={`Roastery floor bean fight. You are badge ${
          self ? formatBadgeNumber(self.badgeNumber) : "unassigned"
        }. Move and aim by touch or keyboard; hearts, splashes and the final placing are announced below.`}
        sx={{ display: "block", width: "100%", height: "100%" }}
      />

      <Box
        aria-live="polite"
        aria-atomic
        sx={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          clipPath: "inset(50%)",
          whiteSpace: "nowrap",
        }}
      >
        {announcement}
      </Box>

      {self ? (
        <BattleHud
          badgeNumber={self.badgeNumber}
          colourHex={selfColourHex ?? FALLBACK_COLOUR}
          emoji={self.emoji}
          hearts={hud.hearts}
          maxHearts={HEALTH.maxHearts}
          remainingMs={hud.remainingMs}
          hits={hud.hits}
          ammo={hud.ammo}
          reloading={hud.reloading}
          reloadProgress={hud.reloadProgress}
          powerUp={hud.powerUp}
          powerUpRemainingMs={hud.powerUpRemainingMs}
          scoreboard={scoreboard}
          offline={offline}
        />
      ) : null}

      {splash ? (
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            top: "38%",
            left: 0,
            right: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
            zIndex: 4,
          }}
        >
          <Box
            sx={{
              px: 2.5,
              py: 1.25,
              borderRadius: 999,
              fontWeight: 900,
              fontSize: { xs: 18, sm: 22 },
              letterSpacing: "-0.02em",
              color: "#fffdf8",
              bgcolor: splash.kind === "dealt" ? "#28734f" : "#8a2f2f",
              boxShadow: "0 10px 30px rgba(45, 27, 19, 0.35)",
              animation: reducedMotion ? "none" : "beanSplashPop 220ms ease-out",
              "@keyframes beanSplashPop": {
                from: { transform: "scale(0.82)", opacity: 0 },
                to: { transform: "scale(1)", opacity: 1 },
              },
            }}
          >
            {splash.kind === "dealt"
              ? `Splashed badge ${formatBadgeNumber(splash.badgeNumber)}!`
              : `Badge ${formatBadgeNumber(splash.badgeNumber)} got you!`}
          </Box>
        </Box>
      ) : null}

      <BattleControls
        onMove={handleMove}
        onAim={handleAim}
        onFiring={handleFiring}
        onReload={handleReload}
        disabled={showCountdown || hud.downed}
        reducedMotion={reducedMotion}
      />

      <Button
        onClick={requestLeave}
        size="small"
        sx={{
          position: "absolute",
          left: "calc(12px + env(safe-area-inset-left))",
          bottom: "calc(16px + env(safe-area-inset-bottom))",
          color: "#fffdf8",
          bgcolor: "rgba(30, 15, 9, 0.55)",
          "&:hover": { bgcolor: "rgba(30, 15, 9, 0.75)" },
        }}
      >
        Leave
      </Button>

      {hud.downed ? (
        <Box
          data-testid="battle-refill-overlay"
          sx={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            px: 3,
            textAlign: "center",
            color: "#fffdf8",
            // Translucent on purpose: the arena stays readable behind it.
            bgcolor: "rgba(30, 15, 9, 0.55)",
            pointerEvents: "none",
          }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 850 }}>
              Refill break
            </Typography>
            <Typography sx={{ mt: 1, opacity: 0.85 }}>
              Back on the floor in a moment with {HEALTH.respawnHearts} hearts.
            </Typography>
          </Box>
        </Box>
      ) : null}

      {!room ? (
        <Stack
          spacing={2}
          sx={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "#fffdf8",
            bgcolor: "rgba(30, 15, 9, 0.9)",
            px: 3,
            textAlign: "center",
          }}
        >
          <Box>
            <CircularProgress color="inherit" />
            <Typography sx={{ mt: 2, fontWeight: 700 }}>Walking onto the floor…</Typography>
          </Box>
        </Stack>
      ) : null}

      {offline ? (
        <Alert
          severity="warning"
          sx={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "calc(16px + env(safe-area-inset-bottom))",
            maxWidth: 360,
          }}
        >
          Connection lost. You are still on the floor, but your throws will not score until it
          returns.
        </Alert>
      ) : null}

      {showCountdown && localStartMs !== null ? (
        <CountdownOverlay
          startAtEpochMs={localStartMs}
          reducedMotion={reducedMotion}
          onGo={() => pulse(60)}
          onComplete={() => setCountdownDone(true)}
        />
      ) : null}

      <Dialog open={showLeaveConfirm} onClose={() => setShowLeaveConfirm(false)}>
        <DialogTitle>Leave the round?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your barista stops where they are and stays a target, so you will almost certainly
            finish last — which means you buy the coffee.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowLeaveConfirm(false)}>Keep playing</Button>
          <Button color="error" variant="contained" onClick={leaveBattle}>
            Leave round
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
