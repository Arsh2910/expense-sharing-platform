import { z } from "zod";

export const createInvitationSchema = z.union([
  z.strictObject({ username: z.string().trim().min(1).max(30) }),
  z.strictObject({ email: z.string().trim().toLowerCase().pipe(z.email().max(255)) }),
]);

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const invitationIdParamsSchema = z.object({
  invitationId: z.uuid("Invitation ID must be a valid UUID"),
});

export const invitationResponseSchema = z.object({ token: z.string().min(1).max(256).optional() });
