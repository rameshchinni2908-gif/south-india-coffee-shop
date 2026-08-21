import type { RequestHandler } from "express";
import type { ZodType } from "zod";

import { HttpError } from "./http-error.js";

export const validateQuery = (schema: ZodType): RequestHandler => {
  return (request, _response, next) => {
    const result = schema.safeParse(request.query as unknown);

    if (!result.success) {
      next(new HttpError(400, "VALIDATION_ERROR", "The query parameters are invalid"));
      return;
    }

    request.validatedQuery = result.data;
    next();
  };
};
