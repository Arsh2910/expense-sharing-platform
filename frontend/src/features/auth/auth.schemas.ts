import { z } from "zod";

export const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Password is required"),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const registerFormSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Display name is required")
      .max(100, "Display name cannot exceed 100 characters"),
    email: z
      .string()
      .trim()
      .min(1, "Email is required")
      .pipe(z.email("Enter a valid email address")),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password cannot exceed 72 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterFormValues = z.infer<typeof registerFormSchema>;

export const verifyEmailFormSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20, "Verification token must be at least 20 characters"),
});

export type VerifyEmailFormValues = z.infer<typeof verifyEmailFormSchema>;

export const updateProfileFormSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(100, "Display name cannot exceed 100 characters"),
  username: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        (value.length >= 2 &&
          value.length <= 30 &&
          /^[A-Za-z0-9_]+$/.test(value)),
      "Username must be 2–30 characters using letters, numbers, or underscores",
    ),
});

export type UpdateProfileFormValues = z.infer<typeof updateProfileFormSchema>;

export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(72, "New password cannot exceed 72 characters"),
    confirmNewPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Passwords do not match",
    path: ["confirmNewPassword"],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

export const changeEmailFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "New email is required")
    .pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Current password is required to confirm"),
});

export type ChangeEmailFormValues = z.infer<typeof changeEmailFormSchema>;

export const deleteAccountFormSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  confirmationText: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value !== "DELETE") {
        ctx.addIssue({
          code: "custom",
          message: 'Type "DELETE" to confirm',
        });
      }
    }),
});

export type DeleteAccountFormValues = z.infer<typeof deleteAccountFormSchema>;
