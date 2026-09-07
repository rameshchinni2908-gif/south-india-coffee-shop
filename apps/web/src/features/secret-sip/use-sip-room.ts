import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { environment } from "../../config/environment.js";
import {
  SIP_SOCKET_PATH,
  type SipAction,
  type SipClientEvents,
  type SipIdentity,
  type SipServerEvents,
  type SipState,
} from "./sip-contract.js";

export const useSipRoom = (identity: SipIdentity | null) => {
  const [state, setState] = useState<SipState | null>(null);
  const [connected, setConnected] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const socketRef = useRef<Socket<SipServerEvents, SipClientEvents> | null>(null);
  const clockRef = useRef({ server: 0, local: 0 });
  const pendingRef = useRef(false);
  useEffect(() => {
    if (!identity) return;
    const socket: Socket<SipServerEvents, SipClientEvents> = io(environment.gameSocketUrl, {
      path: SIP_SOCKET_PATH,
      auth: identity,
      transports: ["websocket"],
      reconnection: true,
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      setError(null);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (failure) => {
      setConnected(false);
      setError(
        failure.message === "websocket error"
          ? "Connection interrupted. Reconnecting to your table…"
          : failure.message,
      );
    });
    socket.on("sip:state", (value) => {
      clockRef.current = { server: value.serverNow, local: performance.now() };
      setState(value);
      setError(null);
    });
    socket.on("sip:closed", () => {
      setClosed(true);
      setConnected(false);
      socket.disconnect();
    });
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [identity]);
  const send = useCallback((action: SipAction) => {
    const socket = socketRef.current;
    if (!socket?.connected || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    socket.timeout(6000).emit("sip:action", action, (failure, result) => {
      pendingRef.current = false;
      setPending(false);
      if (failure) setError("No confirmation yet. Check the table before trying again.");
      else if (!result.ok) setError(result.message ?? "Please try again.");
    });
  }, []);
  const serverNow = useCallback(
    () => clockRef.current.server + performance.now() - clockRef.current.local,
    [],
  );
  const retry = () => socketRef.current?.connect();
  return { state, connected, closed, error, pending, send, retry, serverNow };
};
