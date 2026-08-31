import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";

import { ApiClientError } from "../../../lib/api-client.js";
import type { StaffAccount } from "../../../types/auth.js";
import { AUTH_QUERY_KEY } from "../auth/auth-query.js";
import { createStaffAccount, updateStaffAccount } from "./staff-api.js";
import {
  createStaffFormSchema,
  editStaffFormSchema,
  type StaffFormValues,
} from "./staff-form-schema.js";
import { ADMIN_STAFF_ACCOUNTS_QUERY_KEY } from "./staff-queries.js";

export const StaffAccountDialog = ({
  account,
  currentUserId,
  onClose,
}: {
  account: StaffAccount | null;
  currentUserId: string;
  onClose(): void;
}) => {
  const queryClient = useQueryClient();
  const isEditingSelf = account?.id === currentUserId;
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<StaffFormValues>({
    resolver: zodResolver(account ? editStaffFormSchema : createStaffFormSchema),
    defaultValues: {
      name: account?.name ?? "",
      email: account?.email ?? "",
      password: "",
      role: account?.role ?? "STAFF",
      isActive: account?.isActive ?? true,
    },
  });
  const saveMutation = useMutation({
    mutationFn: (values: StaffFormValues) => {
      if (!account) {
        return createStaffAccount({ ...values, password: values.password });
      }

      return updateStaffAccount(account.id, {
        name: values.name,
        email: values.email,
        role: values.role,
        isActive: values.isActive,
        ...(values.password ? { password: values.password } : {}),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ADMIN_STAFF_ACCOUNTS_QUERY_KEY }),
        ...(isEditingSelf ? [queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY })] : []),
      ]);
      onClose();
    },
  });
  const errorMessage =
    saveMutation.error instanceof ApiClientError
      ? saveMutation.error.message
      : saveMutation.isError
        ? "The staff account could not be saved."
        : null;

  return (
    <Dialog open onClose={saveMutation.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{account ? `Edit ${account.name}` : "Create staff account"}</DialogTitle>
      <DialogContent dividers>
        <Stack
          id="staff-account-form"
          component="form"
          spacing={2}
          onSubmit={(event) => void handleSubmit((values) => saveMutation.mutate(values))(event)}
        >
          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
          {isEditingSelf && (
            <Alert severity="info">
              You can update your details or password, but not remove your own administrator access.
            </Alert>
          )}
          <TextField
            label="Staff name"
            autoFocus
            {...register("name")}
            error={Boolean(errors.name)}
            helperText={errors.name?.message}
          />
          <TextField
            label="Email address"
            type="email"
            autoComplete="off"
            {...register("email")}
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
          />
          <TextField
            label={account ? "New password (optional)" : "Temporary password"}
            type="password"
            autoComplete="new-password"
            {...register("password")}
            error={Boolean(errors.password)}
            helperText={
              errors.password?.message ??
              (account ? "Leave blank to keep the current password." : "Use 12–72 characters.")
            }
          />
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <TextField {...field} select label="Role" disabled={isEditingSelf}>
                <MenuItem value="STAFF">Staff</MenuItem>
                <MenuItem value="ADMIN">Administrator</MenuItem>
              </TextField>
            )}
          />
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={field.value}
                    onChange={field.onChange}
                    disabled={isEditingSelf}
                  />
                }
                label="Account is active"
              />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saveMutation.isPending}>
          Cancel
        </Button>
        <Button
          form="staff-account-form"
          type="submit"
          variant="contained"
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving…" : account ? "Save account" : "Create account"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
