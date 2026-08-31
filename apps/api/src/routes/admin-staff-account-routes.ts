import { Router } from "express";

import { createStaffAccountController } from "../controllers/staff-account-controller.js";
import { createAuthenticateStaff } from "../middleware/authenticate-staff.js";
import { requireRoles } from "../middleware/require-role.js";
import type { AuthService } from "../services/auth-service.js";
import type { StaffAccountService } from "../services/staff-account-service.js";
import { validateBody } from "../middleware/validate-body.js";
import { validateParams } from "../middleware/validate-params.js";
import { validateQuery } from "../middleware/validate-query.js";
import {
  createStaffAccountBodySchema,
  staffAccountIdParamsSchema,
  staffAccountQuerySchema,
  updateStaffAccountBodySchema,
} from "../validation/staff-account-schemas.js";

export const createAdminStaffAccountRouter = (
  authService: AuthService,
  staffAccountService: StaffAccountService,
): Router => {
  const router = Router();
  const controller = createStaffAccountController(staffAccountService);

  router.use(createAuthenticateStaff(authService), requireRoles("ADMIN"));
  router.get("/", validateQuery(staffAccountQuerySchema), controller.list);
  router.post("/", validateBody(createStaffAccountBodySchema), controller.create);
  router.patch(
    "/:id",
    validateParams(staffAccountIdParamsSchema),
    validateBody(updateStaffAccountBodySchema),
    controller.update,
  );

  return router;
};
