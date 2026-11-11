import { z } from "zod";

export const registerSchema = z.object({
  email: z.email().transform((email) => email.trim().toLowerCase()),

  displayName: z.string().trim().min(1).max(100),

  password: z.string().min(8).max(72),
});

export const loginSchema = z.object({
  email: z.email().transform((email) => email.trim().toLowerCase()),
  password: z.string().min(1),
});
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
