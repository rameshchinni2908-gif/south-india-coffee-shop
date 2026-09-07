import type { Server as HttpServer } from "node:http";

import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { Server } from "socket.io";
import { z } from "zod";

import { HttpError } from "../../middleware/http-error.js";
import { validateBody } from "../../middleware/validate-body.js";
import { validateParams } from "../../middleware/validate-params.js";
import {
  SIP_SOCKET_PATH,
  type SipClientEvents,
  type SipIdentity,
  type SipServerEvents,
} from "./sip-contract.js";
import { createSipController } from "./sip-controller.js";
import { sipActionSchema, sipCodeSchema, sipIdentitySchema } from "./sip-schemas.js";
import { createSipService } from "./sip-service.js";

export const createSipModule = ({
  clientUrl,
  roomTtlMinutes,
  maxRoomsPerIpPerHour,
  now,
}: {
  clientUrl: string;
  roomTtlMinutes: number;
  maxRoomsPerIpPerHour: number;
  now?: () => number;
}) => {
  const service = createSipService({ ttlMinutes: roomTtlMinutes, ...(now ? { now } : {}) });
  const controller = createSipController(service);
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  router.get("/health", controller.health);
  router.post(
    "/rooms",
    rateLimit({
      windowMs: 3_600_000,
      limit: maxRoomsPerIpPerHour,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        success: false,
        data: null,
        meta: {},
        error: {
          code: "RATE_LIMITED",
          message: "Too many new tables. Join an existing table or try later.",
        },
      },
    }),
    validateBody(z.object({}).strict()),
    controller.create,
  );
  router.post(
    "/rooms/:code/join",
    validateParams(z.object({ code: sipCodeSchema })),
    validateBody(z.object({}).strict()),
    controller.join,
  );
  let io: Server<SipClientEvents, SipServerEvents, Record<string, never>, SipIdentity> | null =
    null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const safeMessage = (error: unknown) =>
    error instanceof HttpError
      ? error.message
      : "That action could not be completed. Please try again.";
  service.setListener((code) => {
    // Each socket receives its own projection. Never broadcast a secret to a room.
    for (const socket of io?.sockets.sockets.values() ?? []) {
      if (socket.data.code !== code) continue;
      try {
        socket.emit("sip:state", service.state(code, socket.data.token));
      } catch {
        socket.emit("sip:closed");
        socket.disconnect(true);
      }
    }
  });
  return {
    router,
    service,
    attachSocket(server: HttpServer) {
      io = new Server(server, {
        path: SIP_SOCKET_PATH,
        cors: { origin: clientUrl, credentials: true },
        maxHttpBufferSize: 4096,
        allowRequest: (request, callback) =>
          callback(null, !request.headers.origin || request.headers.origin === clientUrl),
      });
      io.use((socket, next) => {
        const parsed = sipIdentitySchema.safeParse(socket.handshake.auth);
        if (!parsed.success) {
          next(new Error("Rejoin this table from your original phone."));
          return;
        }
        try {
          service.state(parsed.data.code, parsed.data.token);
          socket.data = parsed.data;
          next();
        } catch (error) {
          next(new Error(safeMessage(error)));
        }
      });
      io.on("connection", (socket) => {
        let bucketStart = Date.now();
        let count = 0;
        socket.on("disconnect", () => service.disconnect(socket.data.code, socket.data.token));
        try {
          service.connect(socket.data.code, socket.data.token);
        } catch {
          socket.emit("sip:closed");
          socket.disconnect(true);
          return;
        }
        socket.on("sip:action", (action, reply) => {
          if (typeof reply !== "function") return;
          if (Date.now() - bucketStart >= 1000) {
            count = 0;
            bucketStart = Date.now();
          }
          count += 1;
          if (count > 10) {
            reply({ ok: false, message: "Slow down a little and try again." });
            return;
          }
          const parsed = sipActionSchema.safeParse(action);
          if (!parsed.success) {
            reply({ ok: false, message: "That request is not valid." });
            return;
          }
          try {
            service.act(socket.data.code, socket.data.token, parsed.data);
            reply({ ok: true });
          } catch (error) {
            reply({ ok: false, message: safeMessage(error) });
          }
        });
      });
      timer = setInterval(() => service.tick(), 250);
      timer.unref();
    },
    async shutdown() {
      if (timer) clearInterval(timer);
      if (io) {
        io.disconnectSockets(true);
        // Close only this engine: Socket.IO's close() also closes the shared HTTP server.
        io.engine.close();
        io.removeAllListeners();
        io = null;
      }
      service.clear();
    },
  };
};
