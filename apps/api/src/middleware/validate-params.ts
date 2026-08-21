import type { RequestHandler } from "express";
import type { ZodType } from "zod";

import { HttpError } from "./http-error.js";

export const validateParams = (schema: ZodType): RequestHandler => {
  return (request, _response, next) => {
    const result = schema.safeParse(request.params as unknown);

    if (!result.success) {
      next(new HttpError(400, "VALIDATION_ERROR", "The route parameters are invalid"));
      return;
    }

    request.validatedParams = result.data;
    next();
  };
};
