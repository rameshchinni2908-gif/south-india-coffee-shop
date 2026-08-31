import { z } from "zod";

import { USER_ROLES } from "../models/user-model.js";

const queryBooleanSchema = z.enum(["true", "false"]).transform((value) => value === "true");
const passwordSchema = z.string().min(12).max(72);

export const staffAccountIdParamsSchema = z
  .object({ id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier") })
  .strict();

export const staffAccountQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(100).optional(),
    role: z.enum(USER_ROLES).optional(),
    active: queryBooleanSchema.optional(),
    sortBy: z.enum(["name", "createdAt"]).default("name"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();

export const createStaffAccountBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    password: passwordSchema,
    role: z.enum(USER_ROLES).default("STAFF"),
    isActive: z.boolean().default(true),
  })
  .strict();

export const updateStaffAccountBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    password: passwordSchema.optional(),
    role: z.enum(USER_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "At least one field is required");

export type StaffAccountQuery = z.infer<typeof staffAccountQuerySchema>;
export type CreateStaffAccountInput = z.infer<typeof createStaffAccountBodySchema>;
export type UpdateStaffAccountInput = z.infer<typeof updateStaffAccountBodySchema>;
