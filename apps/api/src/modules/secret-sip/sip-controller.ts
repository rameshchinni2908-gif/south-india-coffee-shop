import type { RequestHandler } from "express";

import type { SipService } from "./sip-service.js";

export const createSipController = (
  service: SipService,
): { health: RequestHandler; create: RequestHandler; join: RequestHandler } => ({
  health: (_req, res) => {
    res.json({ success: true, data: { enabled: true }, meta: {}, error: null });
  },
  create: (_req, res) => {
    res.status(201).json({ success: true, data: service.create(), meta: {}, error: null });
  },
  join: (req, res) => {
    res.json({
      success: true,
      data: service.join((req.validatedParams as { code: string }).code),
      meta: {},
      error: null,
    });
  },
});
