import type { RequestHandler } from "express";
import type { ZodType } from "zod";

import { HttpError } from "./http-error.js";

export const validateBody = (schema: ZodType): RequestHandler => {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body as unknown);

    if (!result.success) {
      next(new HttpError(400, "VALIDATION_ERROR", "The request body is invalid"));
      return;
    }

    request.body = result.data;
    next();
  };
};
