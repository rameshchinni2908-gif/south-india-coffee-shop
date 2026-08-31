import { z } from "zod";

const fields = {
  name: z.string().trim().min(1, "Enter a name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  role: z.enum(["ADMIN", "STAFF"]),
  isActive: z.boolean(),
};

export const createStaffFormSchema = z.object({
  ...fields,
  password: z.string().min(12, "Use at least 12 characters").max(72),
});

export const editStaffFormSchema = z.object({
  ...fields,
  password: z.union([z.literal(""), z.string().min(12, "Use at least 12 characters").max(72)]),
});

export type StaffFormValues = z.infer<typeof editStaffFormSchema>;
