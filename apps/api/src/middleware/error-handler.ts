import type { ErrorRequestHandler } from "express";

import { HttpError } from "./http-error.js";

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  const isDuplicateKeyError =
    typeof error === "object" && error !== null && "code" in error && error.code === 11_000;
  const httpError =
    error instanceof HttpError
      ? error
      : isDuplicateKeyError
        ? new HttpError(409, "DUPLICATE_RESOURCE", "A unique value is already in use")
        : new HttpError(500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred");

  if (httpError.statusCode >= 500) {
    request.log.error({ err: error }, "Request failed");
  }

  response.status(httpError.statusCode).json({
    success: false,
    data: null,
    meta: {},
    error: {
      code: httpError.code,
      message: httpError.message,
    },
  });
};
