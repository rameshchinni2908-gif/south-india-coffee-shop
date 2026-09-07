import ChevronLeftOutlinedIcon from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import DoNotDisturbOnOutlinedIcon from "@mui/icons-material/DoNotDisturbOnOutlined";
import { Box } from "@mui/material";
import { useCallback, useEffect, useRef } from "react";

export type SteerDirection = -1 | 0 | 1;

interface RaceControlsProps {
  onSteer(direction: SteerDirection): void;
  onBrake(isBraking: boolean): void;
  disabled: boolean;
}

type Side = "left" | "right";

const zoneSx = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: "38%",
  minWidth: 96,
  border: 0,
  p: 0,
  m: 0,
  display: "grid",
  placeItems: "center",
  color: "#fffdf8",
  cursor: "pointer",
  touchAction: "none",
  WebkitTapHighlightColor: "transparent",
  transition: "background-color 120ms linear",
} as const;

export const RaceControls = ({ onSteer, onBrake, disabled }: RaceControlsProps) => {
  const pointersRef = useRef<Map<number, Side>>(new Map());
  const heldRef = useRef<Side[]>([]);
  const keysRef = useRef<Set<Side>>(new Set());
  const brakePointersRef = useRef<Set<number>>(new Set());
  const brakingKeyRef = useRef(false);
  const steerRef = useRef(onSteer);
  const brakeRef = useRef(onBrake);

  // Synced in an effect, not during render: only pointer/key handlers read them.
  useEffect(() => {
    steerRef.current = onSteer;
    brakeRef.current = onBrake;
  });

  const publishSteering = useCallback(() => {
    const held = heldRef.current;
    const latest = held.length > 0 ? held[held.length - 1] : undefined;
    const keyed = keysRef.current;
    const side =
      latest ??
      (keyed.has("right") && !keyed.has("left")
        ? "right"
        : keyed.has("left") && !keyed.has("right")
          ? "left"
          : undefined);

    steerRef.current(side === "left" ? -1 : side === "right" ? 1 : 0);
  }, []);

  const publishBraking = useCallback(() => {
    brakeRef.current(brakePointersRef.current.size > 0 || brakingKeyRef.current);
  }, []);

  const press = useCallback(
    (side: Side, pointerId: number) => {
      pointersRef.current.set(pointerId, side);
      heldRef.current = [...heldRef.current.filter((entry) => entry !== side), side];
      publishSteering();
    },
    [publishSteering],
  );

  const release = useCallback(
    (pointerId: number) => {
      const side = pointersRef.current.get(pointerId);

      if (!side) {
        return;
      }

      pointersRef.current.delete(pointerId);

      if (!Array.from(pointersRef.current.values()).includes(side)) {
        heldRef.current = heldRef.current.filter((entry) => entry !== side);
      }

      publishSteering();
    },
    [publishSteering],
  );

  useEffect(() => {
    if (disabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        keysRef.current.add(event.key === "ArrowLeft" ? "left" : "right");
        publishSteering();

        return;
      }

      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        brakingKeyRef.current = true;
        publishBraking();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        keysRef.current.delete(event.key === "ArrowLeft" ? "left" : "right");
        publishSteering();

        return;
      }

      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        brakingKeyRef.current = false;
        publishBraking();
      }
    };

    const handleBlur = () => {
      keysRef.current.clear();
      brakingKeyRef.current = false;
      publishSteering();
      publishBraking();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [disabled, publishBraking, publishSteering]);

  useEffect(
    () => () => {
      steerRef.current(0);
      brakeRef.current(false);
    },
    [],
  );

  const zoneHandlers = (side: Side) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (disabled) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      press(side, event.pointerId);
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => release(event.pointerId),
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => release(event.pointerId),
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => release(event.pointerId),
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => event.preventDefault(),
  });

  return (
    <Box
      aria-hidden={disabled}
      sx={{
        position: "absolute",
        inset: 0,
        pointerEvents: disabled ? "none" : "auto",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <Box
        component="button"
        type="button"
        disabled={disabled}
        aria-label="Steer left (hold). Arrow Left on a keyboard."
        {...zoneHandlers("left")}
        sx={{
          ...zoneSx,
          left: 0,
          background: "linear-gradient(to right, rgba(30, 15, 9, 0.34), rgba(30, 15, 9, 0.04))",
          "&:active": {
            background:
              "linear-gradient(to right, rgba(184, 95, 22, 0.52), rgba(184, 95, 22, 0.1))",
          },
        }}
      >
        <ChevronLeftOutlinedIcon aria-hidden sx={{ fontSize: 46, opacity: 0.85 }} />
      </Box>

      <Box
        component="button"
        type="button"
        disabled={disabled}
        aria-label="Steer right (hold). Arrow Right on a keyboard."
        {...zoneHandlers("right")}
        sx={{
          ...zoneSx,
          right: 0,
          background: "linear-gradient(to left, rgba(30, 15, 9, 0.34), rgba(30, 15, 9, 0.04))",
          "&:active": {
            background: "linear-gradient(to left, rgba(184, 95, 22, 0.52), rgba(184, 95, 22, 0.1))",
          },
        }}
      >
        <ChevronRightOutlinedIcon aria-hidden sx={{ fontSize: 46, opacity: 0.85 }} />
      </Box>

      <Box
        component="button"
        type="button"
        disabled={disabled}
        aria-label="Brake (hold). Space on a keyboard."
        onPointerDown={(event: React.PointerEvent<HTMLElement>) => {
          if (disabled) {
            return;
          }

          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          brakePointersRef.current.add(event.pointerId);
          publishBraking();
        }}
        onPointerUp={(event: React.PointerEvent<HTMLElement>) => {
          brakePointersRef.current.delete(event.pointerId);
          publishBraking();
        }}
        onPointerCancel={(event: React.PointerEvent<HTMLElement>) => {
          brakePointersRef.current.delete(event.pointerId);
          publishBraking();
        }}
        onPointerLeave={(event: React.PointerEvent<HTMLElement>) => {
          brakePointersRef.current.delete(event.pointerId);
          publishBraking();
        }}
        sx={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: "calc(20px + env(safe-area-inset-bottom))",
          width: 112,
          height: 68,
          border: 0,
          borderRadius: 999,
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
        <DoNotDisturbOnOutlinedIcon aria-hidden sx={{ fontSize: 30 }} />
      </Box>
    </Box>
  );
};
