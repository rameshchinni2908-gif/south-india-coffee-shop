import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { asyncHandler } from "../middleware/async-handler.js";
import { HttpError } from "../middleware/http-error.js";
import { createRequireTrustedOrigin } from "../middleware/require-trusted-origin.js";
import { validateBody } from "../middleware/validate-body.js";
import type { OrderAssistantService } from "../services/order-assistant-service.js";
import {
  orderDraftBodySchema,
  type OrderDraftInput,
} from "../validation/order-assistant-schemas.js";

export const createOrderAssistantRouter = (
  orderAssistantService: OrderAssistantService,
  clientUrl: string,
): Router => {
  const router = Router();
  // A burst brake for a paid public endpoint; the daily cap in the service bounds spending.
  const draftLimit = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(
        new HttpError(
          429,
          "ORDER_ASSISTANT_RATE_LIMITED",
          "Too many order messages. Please wait a few minutes or add items from the menu.",
        ),
      );
    },
  });

  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  router.post(
    "/draft",
    createRequireTrustedOrigin(clientUrl),
    validateBody(orderDraftBodySchema),
    draftLimit,
    asyncHandler(async (request, response) => {
      const { message } = request.body as OrderDraftInput;
      const draft = await orderAssistantService.draft(message);
      response.status(200).json({ success: true, data: { draft }, meta: {}, error: null });
    }),
  );

  return router;
};
