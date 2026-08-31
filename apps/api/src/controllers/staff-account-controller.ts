import type { RequestHandler } from "express";

import { asyncHandler } from "../middleware/async-handler.js";
import { HttpError } from "../middleware/http-error.js";
import type { StaffAccountService } from "../services/staff-account-service.js";
import type {
  CreateStaffAccountInput,
  StaffAccountQuery,
  UpdateStaffAccountInput,
} from "../validation/staff-account-schemas.js";

export const createStaffAccountController = (
  staffAccountService: StaffAccountService,
): { list: RequestHandler; create: RequestHandler; update: RequestHandler } => ({
  list: asyncHandler(async (request, response) => {
    const result = await staffAccountService.list(request.validatedQuery as StaffAccountQuery);

    response.status(200).json({
      success: true,
      data: { staffAccounts: result.items },
      meta: result.meta,
      error: null,
    });
  }),

  create: asyncHandler(async (request, response) => {
    const staffAccount = await staffAccountService.create(request.body as CreateStaffAccountInput);

    response.status(201).json({
      success: true,
      data: { staffAccount },
      meta: {},
      error: null,
    });
  }),

  update: asyncHandler(async (request, response) => {
    if (!request.authenticatedUser) {
      throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    }

    const { id } = request.validatedParams as { id: string };
    const staffAccount = await staffAccountService.update(
      request.authenticatedUser.id,
      id,
      request.body as UpdateStaffAccountInput,
    );

    response.status(200).json({
      success: true,
      data: { staffAccount },
      meta: {},
      error: null,
    });
  }),
});
