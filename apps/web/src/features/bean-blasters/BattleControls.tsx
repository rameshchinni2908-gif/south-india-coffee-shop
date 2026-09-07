import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import { Box } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";

/** How far the thumb travels for full-speed movement. */
const JOYSTICK_RADIUS = 56;
const JOYSTICK_DEAD_ZONE = 6;
/** Below this drag distance the aim keeps its previous angle rather than snapping. */
const AIM_DEAD_ZONE = 14;
const AIM_LINE_LENGTH = 96;

interface Point {
  x: number;
  y: number;
}

interface JoystickState {
  readonly origin: Point;
  readonly dx: number;
  readonly dy: number;
}

interface AimState {
  readonly origin: Point;
  readonly angle: number;
}

interface BattleControlsProps {
  /** Movement vector, each component in [-1, 1] with a magnitude ≤ 1. */
  onMove(dx: number, dy: number): void;
  /** Facing in radians. Independent of movement — strafing preserves aim. */
  onAim(angle: number): void;
  onFiring(isFiring: boolean): void;
  onReload(): void;
  disabled: boolean;
  reducedMotion: boolean;
}

const MOVE_KEYS: Readonly<Record<string, Point>> = {
  w: { x: 0, y: -1 },
  a: { x: -1, y: 0 },
  s: { x: 0, y: 1 },
  d: { x: 1, y: 0 },
  arrowup: { x: 0, y: -1 },
  arrowleft: { x: -1, y: 0 },
  arrowdown: { x: 0, y: 1 },
  arrowright: { x: 1, y: 0 },
};

const zoneSx = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: "50%",
  border: 0,
  p: 0,
  m: 0,
  bgcolor: "transparent",
  cursor: "pointer",
  touchAction: "none",
  WebkitTapHighlightColor: "transparent",
} as const;

/**
 * Twin-thumb controls.
 *
 * Every pointer is tracked by its own `pointerId`, and move/up/cancel are heard
 * on `window` rather than on the zone element. That is the whole reason this
 * component exists as its own file: the single most likely mobile bug in this
 * feature is assuming one active touch, which silently breaks the moment a
 * player walks and throws at the same time (BEAN-BLASTERS.md §13).
 */
export const BattleControls = ({
  onMove,
  onAim,
  onFiring,
  onReload,
  disabled,
  reducedMotion,
}: BattleControlsProps) => {
  const movePointerRef = useRef<number | null>(null);
  const moveOriginRef = useRef<Point>({ x: 0, y: 0 });
  const aimPointerRef = useRef<number | null>(null);
  const aimOriginRef = useRef<Point>({ x: 0, y: 0 });
  const mouseFiringRef = useRef(false);
  const lastAngleRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const disabledRef = useRef(disabled);

  const moveRef = useRef(onMove);
  const aimRef = useRef(onAim);
  const firingRef = useRef(onFiring);
  const reloadRef = useRef(onReload);

  const [joystick, setJoystick] = useState<JoystickState | null>(null);
  const [aim, setAim] = useState<AimState | null>(null);

  // Synced in an effect, not during render: only pointer and key handlers read
  // them, and they run after paint.
  useEffect(() => {
    moveRef.current = onMove;
    aimRef.current = onAim;
    firingRef.current = onFiring;
    reloadRef.current = onReload;
    disabledRef.current = disabled;
  });

  const publishKeyboardMove = useCallback(() => {
    let x = 0;
    let y = 0;

    for (const key of keysRef.current) {
      const vector = MOVE_KEYS[key];

      if (vector) {
        x += vector.x;
        y += vector.y;
      }
    }

    const length = Math.hypot(x, y);

    if (length > 1) {
      x /= length;
      y /= length;
    }

    moveRef.current(x, y);
  }, []);

  const releasePointer = useCallback((pointerId: number) => {
    if (movePointerRef.current === pointerId) {
      movePointerRef.current = null;
      setJoystick(null);
      moveRef.current(0, 0);

      return;
    }

    if (aimPointerRef.current === pointerId) {
      aimPointerRef.current = null;
      setAim(null);
      firingRef.current(false);

      return;
    }

    if (mouseFiringRef.current) {
      mouseFiringRef.current = false;
      firingRef.current(false);
    }
  }, []);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (event.pointerId === movePointerRef.current) {
        const origin = moveOriginRef.current;
        const rawX = event.clientX - origin.x;
        const rawY = event.clientY - origin.y;
        const distance = Math.hypot(rawX, rawY);

        if (distance < JOYSTICK_DEAD_ZONE) {
          setJoystick({ origin, dx: 0, dy: 0 });
          moveRef.current(0, 0);

          return;
        }

        const scale = Math.min(1, distance / JOYSTICK_RADIUS) / distance;
        const dx = rawX * scale;
        const dy = rawY * scale;

        setJoystick({ origin, dx, dy });
        moveRef.current(dx, dy);

        return;
      }

      if (event.pointerId === aimPointerRef.current) {
        const origin = aimOriginRef.current;
        const rawX = event.clientX - origin.x;
        const rawY = event.clientY - origin.y;

        if (Math.hypot(rawX, rawY) >= AIM_DEAD_ZONE) {
          lastAngleRef.current = Math.atan2(rawY, rawX);
        }

        setAim({ origin, angle: lastAngleRef.current });
        aimRef.current(lastAngleRef.current);

        return;
      }

      // Desktop: the barista is drawn at the centre of the viewport, so the
      // mouse aims absolutely rather than by dragging.
      if (event.pointerType === "mouse" && !disabledRef.current) {
        const angle = Math.atan2(
          event.clientY - window.innerHeight / 2,
          event.clientX - window.innerWidth / 2,
        );
        lastAngleRef.current = angle;
        aimRef.current(angle);
      }
    };

    const handleUp = (event: PointerEvent) => releasePointer(event.pointerId);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [releasePointer]);

  useEffect(() => {
    if (disabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key in MOVE_KEYS) {
        event.preventDefault();

        if (!event.repeat) {
          keysRef.current.add(key);
          publishKeyboardMove();
        }

        return;
      }

      if (key === "r" && !event.repeat) {
        event.preventDefault();
        reloadRef.current();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key in MOVE_KEYS) {
        event.preventDefault();
        keysRef.current.delete(key);
        publishKeyboardMove();
      }
    };

    const handleBlur = () => {
      keysRef.current.clear();
      publishKeyboardMove();
      firingRef.current(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [disabled, publishKeyboardMove]);

  useEffect(
    () => () => {
      moveRef.current(0, 0);
      firingRef.current(false);
    },
    [],
  );

  const startMove = (event: React.PointerEvent<HTMLElement>) => {
    if (disabled || movePointerRef.current !== null) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    movePointerRef.current = event.pointerId;
    moveOriginRef.current = { x: event.clientX, y: event.clientY };
    setJoystick({ origin: { x: event.clientX, y: event.clientY }, dx: 0, dy: 0 });
    moveRef.current(0, 0);
  };

  const startAim = (event: React.PointerEvent<HTMLElement>) => {
    if (disabled) {
      return;
    }

    event.preventDefault();

    if (event.pointerType === "mouse") {
      mouseFiringRef.current = true;
      firingRef.current(true);

      return;
    }

    if (aimPointerRef.current !== null) {
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    aimPointerRef.current = event.pointerId;
    aimOriginRef.current = { x: event.clientX, y: event.clientY };
    setAim({ origin: { x: event.clientX, y: event.clientY }, angle: lastAngleRef.current });
    firingRef.current(true);
  };

  return (
    <Box
      data-testid="battle-controls"
      aria-hidden={disabled}
      sx={{
        position: "absolute",
        inset: 0,
        pointerEvents: disabled ? "none" : "auto",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <Box
        component="button"
        type="button"
        data-testid="battle-move-zone"
        disabled={disabled}
        aria-label="Move (hold and drag). W, A, S, D or the arrow keys on a keyboard."
        onPointerDown={startMove}
        onContextMenu={(event: React.MouseEvent<HTMLElement>) => event.preventDefault()}
        sx={{
          ...zoneSx,
          left: 0,
          background: "linear-gradient(to right, rgba(30, 15, 9, 0.22), rgba(30, 15, 9, 0.02))",
        }}
      />

      <Box
        component="button"
        type="button"
        data-testid="battle-aim-zone"
        disabled={disabled}
        aria-label="Aim and throw (hold and drag). Mouse to aim, click to throw."
        onPointerDown={startAim}
        onContextMenu={(event: React.MouseEvent<HTMLElement>) => event.preventDefault()}
        sx={{
          ...zoneSx,
          right: 0,
          background: "linear-gradient(to left, rgba(30, 15, 9, 0.22), rgba(30, 15, 9, 0.02))",
        }}
      />

      {joystick ? (
        <Box
          aria-hidden
          data-testid="battle-joystick"
          sx={{
            position: "fixed",
            left: joystick.origin.x,
            top: joystick.origin.y,
            width: JOYSTICK_RADIUS * 2,
            height: JOYSTICK_RADIUS * 2,
            ml: `${-JOYSTICK_RADIUS}px`,
            mt: `${-JOYSTICK_RADIUS}px`,
            borderRadius: "50%",
            pointerEvents: "none",
            border: "2px solid rgba(255, 253, 248, 0.35)",
            bgcolor: "rgba(30, 15, 9, 0.22)",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              left: JOYSTICK_RADIUS + joystick.dx * JOYSTICK_RADIUS - 22,
              top: JOYSTICK_RADIUS + joystick.dy * JOYSTICK_RADIUS - 22,
              width: 44,
              height: 44,
              borderRadius: "50%",
              bgcolor: "rgba(240, 194, 122, 0.75)",
              transition: reducedMotion ? "none" : "background-color 120ms linear",
            }}
          />
        </Box>
      ) : null}

      {aim ? (
        <Box
          aria-hidden
          data-testid="battle-aim-line"
          sx={{
            position: "fixed",
            left: aim.origin.x,
            top: aim.origin.y,
            width: AIM_LINE_LENGTH,
            height: 4,
            borderRadius: 999,
            pointerEvents: "none",
            transformOrigin: "0 50%",
            transform: `translateY(-50%) rotate(${aim.angle}rad)`,
            background:
              "linear-gradient(to right, rgba(240, 194, 122, 0.9), rgba(240, 194, 122, 0))",
          }}
        />
      ) : null}

      <Box
        component="button"
        type="button"
        data-testid="battle-reload"
        disabled={disabled}
        aria-label="Refill your clip. R on a keyboard."
        onPointerDown={(event: React.PointerEvent<HTMLElement>) => {
          event.stopPropagation();
        }}
        onClick={(event: React.MouseEvent<HTMLElement>) => {
          event.stopPropagation();
          reloadRef.current();
        }}
        sx={{
          position: "absolute",
          right: "calc(16px + env(safe-area-inset-right))",
          bottom: "calc(84px + env(safe-area-inset-bottom))",
          width: 64,
          height: 64,
          minWidth: 44,
          minHeight: 44,
          border: 0,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          color: "#fffdf8",
          cursor: "pointer",
          touchAction: "none",
          WebkitTapHighlightColor: "transparent",
          bgcolor: "rgba(30, 15, 9, 0.5)",
          backdropFilter: "blur(6px)",
          "&:active": { bgcolor: "rgba(111, 50, 25, 0.85)" },
        }}
      >
        <AutorenewOutlinedIcon aria-hidden sx={{ fontSize: 28 }} />
      </Box>
    </Box>
  );
};
