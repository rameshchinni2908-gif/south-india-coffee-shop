import express from "express";
import { Error as MongooseError } from "mongoose";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { asyncHandler } from "../src/middleware/async-handler.js";
import { errorHandler } from "../src/middleware/error-handler.js";

const createValidationErrorApp = () => {
  const app = express();

  app.post(
    "/model-validation",
    asyncHandler(async () => {
      throw new MongooseError.ValidationError();
    }),
  );
  app.use(errorHandler);

  return app;
};

describe("errorHandler", () => {
  it("returns a safe 400 response for Mongoose model validation failures", async () => {
    const response = await request(createValidationErrorApp()).post("/model-validation");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      data: null,
      meta: {},
      error: {
        code: "VALIDATION_ERROR",
        message: "The submitted data is invalid",
      },
    });
  });
});
