import { z } from "zod";

const newPasswordSchema = z.string().min(8).refine(
  (value) => Buffer.byteLength(value, "utf8") <= 72,
  "Password must be at most 72 UTF-8 bytes",
);

export const registerSchema = z.object({
  email: z.email().transform((email) => email.trim().toLowerCase()),

  displayName: z.string().trim().min(1).max(100),

  password: newPasswordSchema,
});

export const loginSchema = z.object({
  email: z.email().transform((email) => email.trim().toLowerCase()),
  password: z.string().min(1),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(20).optional() });
export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  username: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_]+$/).nullable().optional(),
}).refine((value) => value.displayName !== undefined || value.username !== undefined, "At least one profile field is required");
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: newPasswordSchema });
export const changeEmailSchema = z.object({ email: z.email().transform((email) => email.trim().toLowerCase()), password: z.string().min(1) });
export const deleteAccountSchema = z.object({ currentPassword: z.string().min(1) });
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(128) });
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(255)),
});
export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid or expired reset link"),
  newPassword: newPasswordSchema,
});
