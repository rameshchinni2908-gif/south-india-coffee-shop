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

import { CountdownOverlay } from "./CountdownOverlay.js";
import { createRaceEngine, type RaceEngine } from "./engine/index.js";
import { getRaceResult } from "./game-api.js";
import {
  findCarColour,
  findTrack,
  formatCarNumber,
  KAAPI_CIRCUIT,
  ROOM_CODE_PATTERN,
  TOTAL_LAPS,
} from "./game-contract.js";
import { KAAPI_KARTS_PATH, kaapiKartsResultsPath } from "./game-paths.js";
import { pulse } from "./game-preferences.js";
import { GameErrorState } from "./GameStates.js";
import { readPlayerId } from "./player-identity.js";
import { RaceControls, type SteerDirection } from "./RaceControls.js";
import { RaceHud, type HudStanding } from "./RaceHud.js";
import { useGameSocket } from "./use-game-socket.js";
import { useReducedMotion } from "./use-reduced-motion.js";

const HUD_UPDATE_INTERVAL_MS = 90;
const FALLBACK_COLOUR = "#715b50";

interface HudSnapshot {
  lap: number;
  elapsedMs: number;
  speed: number;
  boostReady: boolean;
  position: number;
}

const INITIAL_HUD: HudSnapshot = {
  lap: 1,
  elapsedMs: 0,
  speed: 0,
  boostReady: false,
  position: 1,
};

export const RacePage = () => {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { code: codeParam } = useParams<{ code?: string }>();
  const code = (codeParam ?? "").toUpperCase();
  const isValidCode = ROOM_CODE_PATTERN.test(code);
  const [playerId] = useState(() => readPlayerId());

  const socket = useGameSocket({ code: isValidCode ? code : null, playerId });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<RaceEngine | null>(null);
  const startRef = useRef<number | null>(null);
  const hudUpdatedAtRef = useRef(0);
  const colourByCarRef = useRef<Map<number, string>>(new Map());
  const knownGhostsRef = useRef<Set<number>>(new Set());
  const lapAnnouncedRef = useRef(0);
  const boostReadyRef = useRef(false);
  const sendPositionRef = useRef(socket.sendPosition);
  const sendFinishRef = useRef(socket.sendFinish);

  // Synced in an effect, not during render: the engine callbacks below only read
  // these after mount.
  useEffect(() => {
    sendPositionRef.current = socket.sendPosition;
    sendFinishRef.current = socket.sendFinish;
  });

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [announcement, setAnnouncement] = useState("");
  const [countdownDone, setCountdownDone] = useState(false);
  const [hasFinished, setHasFinished] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const room = socket.state;
  const players = useMemo(
    () => [...(room?.players ?? [])].sort((a, b) => a.carNumber - b.carNumber),
    [room],
  );
  const self = players.find((player) => player.playerId === playerId) ?? null;
  const track = findTrack(room?.trackId ?? "") ?? KAAPI_CIRCUIT;
  const selfColourHex = self ? (findCarColour(self.colour)?.hex ?? FALLBACK_COLOUR) : null;
  const gridSlot = self ? Math.max(0, players.indexOf(self)) : 0;
  const raceStartsAtMs = room?.raceStartsAt ? Date.parse(room.raceStartsAt) : null;
  const localStartMs =
    raceStartsAtMs !== null && Number.isFinite(raceStartsAtMs)
      ? raceStartsAtMs + socket.serverClockOffsetMs
      : null;

  useEffect(() => {
    startRef.current = localStartMs;
  }, [localStartMs]);

  useEffect(() => {
    colourByCarRef.current = new Map(
      players.map((player) => [
        player.carNumber,
        findCarColour(player.colour)?.hex ?? FALLBACK_COLOUR,
      ]),
    );
  }, [players]);

  const canMount = Boolean(self) && localStartMs !== null;
  const selfCarNumber = self?.carNumber ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    const startAt = startRef.current;

    if (!canvas || !canMount || selfCarNumber === null || !selfColourHex || startAt === null) {
      return;
    }

    const engine = createRaceEngine({
      canvas,
      track,
      selfCarNumber,
      selfColour: selfColourHex,
      gridSlot,
      reducedMotion,
      onLap: (lap) => {
        if (lap > lapAnnouncedRef.current) {
          lapAnnouncedRef.current = lap;
          setAnnouncement(`Lap ${Math.min(lap, TOTAL_LAPS)} of ${TOTAL_LAPS}`);
        }
      },
      onFinish: (finishMs, lapSplits) => {
        setHasFinished(true);
        setAnnouncement("You crossed the line. Waiting for the final standings.");
        sendFinishRef.current({ finishMs, lapSplits });
      },
      onBroadcast: (snapshot) => {
        sendPositionRef.current({
          x: snapshot.x,
          y: snapshot.y,
          heading: snapshot.heading,
          lap: snapshot.lap,
          progress: snapshot.progress,
        });
      },
      onHud: (next) => {
        const now = Date.now();
        const boostChanged = next.boostReady !== boostReadyRef.current;

        if (boostChanged) {
          if (next.boostReady) {
            pulse(20);
          }

          boostReadyRef.current = next.boostReady;
        }

        if (!boostChanged && now - hudUpdatedAtRef.current < HUD_UPDATE_INTERVAL_MS) {
          return;
        }

        hudUpdatedAtRef.current = now;
        setHud({
          lap: next.lap,
          elapsedMs: next.elapsedMs,
          speed: next.speed,
          boostReady: next.boostReady,
          position: next.position,
        });
      },
    });

    engineRef.current = engine;
    engine.mount(startAt);

    return () => {
      engine.destroy();
      engineRef.current = null;
      knownGhostsRef.current.clear();
    };
  }, [canMount, gridSlot, reducedMotion, selfCarNumber, selfColourHex, track]);

  useEffect(() => {
    const unsubscribe = socket.subscribeToGhosts((ghost) => {
      const engine = engineRef.current;

      if (!engine) {
        return;
      }

      knownGhostsRef.current.add(ghost.carNumber);
      engine.upsertGhost({
        carNumber: ghost.carNumber,
        colour: colourByCarRef.current.get(ghost.carNumber) ?? FALLBACK_COLOUR,
        x: ghost.x,
        y: ghost.y,
        heading: ghost.heading,
        lap: ghost.lap,
        progress: ghost.progress,
      });
    });

    return unsubscribe;
  }, [socket.subscribeToGhosts]);

  useEffect(() => {
    const engine = engineRef.current;

    if (!engine) {
      return;
    }

    const present = new Set(players.map((player) => player.carNumber));

    for (const carNumber of Array.from(knownGhostsRef.current)) {
      if (!present.has(carNumber)) {
        engine.removeGhost(carNumber);
        knownGhostsRef.current.delete(carNumber);
      }
    }
  }, [players]);

  // Rejoining a race that already started needs no special case here:
  // CountdownOverlay measures a negative remaining time on its first tick and
  // fires onGo/onComplete straight away.

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
        // Wake lock is a nicety; an unsupported browser just dims as usual.
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
      if (socket.status !== "RACING" || hasFinished) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [hasFinished, socket.status]);

  const resultFallbackQuery = useQuery({
    queryKey: ["game", "result", code],
    queryFn: ({ signal }) => getRaceResult(code, signal),
    enabled: isValidCode && hasFinished && socket.results === null,
    retry: false,
    refetchInterval: 6_000,
  });

  const resultsAvailable = socket.results !== null || Boolean(resultFallbackQuery.data);

  useEffect(() => {
    if (resultsAvailable || socket.status === "RESULTS") {
      navigate(kaapiKartsResultsPath(code), { replace: true });
    }
  }, [code, navigate, resultsAvailable, socket.status]);

  const handleSteer = useCallback((direction: SteerDirection) => {
    engineRef.current?.setSteering(direction);
  }, []);

  const handleBrake = useCallback((isBraking: boolean) => {
    engineRef.current?.setBraking(isBraking);
  }, []);

  const leaveRace = () => {
    socket.leaveRoom();
    navigate(KAAPI_KARTS_PATH, { replace: true });
  };

  const requestLeave = () => {
    if (socket.status === "RACING" && !hasFinished) {
      setShowLeaveConfirm(true);

      return;
    }

    leaveRace();
  };

  if (!isValidCode) {
    return (
      <Box component="main" sx={{ py: 8, px: 3 }}>
        <GameErrorState
          title="That room code looks wrong"
          message="Room codes are four characters long and never use O, 0, I or 1."
          actionLabel="Back to Kaapi Karts"
          onAction={() => navigate(KAAPI_KARTS_PATH)}
        />
      </Box>
    );
  }

  const standings: readonly HudStanding[] = players.map((player) => ({
    carNumber: player.carNumber,
    colourHex: findCarColour(player.colour)?.hex ?? FALLBACK_COLOUR,
    isSelf: player.playerId === playerId,
  }));
  const showCountdown = localStartMs !== null && !countdownDone;

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
        aria-label={`Kaapi Circuit race view. Your kart is car ${
          self ? formatCarNumber(self.carNumber) : "unassigned"
        }. Steering is by touch or arrow keys; live progress is announced below.`}
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
        <RaceHud
          carNumber={self.carNumber}
          colourHex={selfColourHex ?? FALLBACK_COLOUR}
          emoji={self.emoji}
          lap={hud.lap}
          totalLaps={TOTAL_LAPS}
          elapsedMs={hud.elapsedMs}
          position={hud.position}
          fieldSize={Math.max(players.length, 1)}
          boostReady={hud.boostReady}
          standings={standings}
          offline={socket.connection !== "connected" && socket.connection !== "idle"}
        />
      ) : null}

      <RaceControls
        onSteer={handleSteer}
        onBrake={handleBrake}
        disabled={showCountdown || hasFinished}
      />

      <Button
        onClick={requestLeave}
        size="small"
        sx={{
          position: "absolute",
          right: "calc(12px + env(safe-area-inset-right))",
          bottom: "calc(16px + env(safe-area-inset-bottom))",
          color: "#fffdf8",
          bgcolor: "rgba(30, 15, 9, 0.55)",
          "&:hover": { bgcolor: "rgba(30, 15, 9, 0.75)" },
        }}
      >
        Leave
      </Button>

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
            <Typography sx={{ mt: 2, fontWeight: 700 }}>Rolling onto the grid…</Typography>
          </Box>
        </Stack>
      ) : null}

      {hasFinished ? (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            px: 3,
            textAlign: "center",
            color: "#fffdf8",
            bgcolor: "rgba(30, 15, 9, 0.86)",
          }}
        >
          <Box>
            <CircularProgress color="inherit" />
            <Typography variant="h5" sx={{ mt: 2, fontWeight: 850 }}>
              Chequered flag
            </Typography>
            <Typography sx={{ mt: 1, opacity: 0.8 }}>
              Waiting for everyone else to finish…
            </Typography>
            {resultFallbackQuery.isError ? (
              <Alert severity="warning" sx={{ mt: 2 }}>
                The standings are taking a while. They will appear as soon as the server answers.
              </Alert>
            ) : null}
          </Box>
        </Box>
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
        <DialogTitle>Leave the race?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your kart will switch to auto-pilot and will almost certainly finish last — which means
            you buy the coffee.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowLeaveConfirm(false)}>Keep racing</Button>
          <Button color="error" variant="contained" onClick={leaveRace}>
            Leave race
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
