import { z } from "zod";

export const createInvitationSchema = z.union([
  z.object({ username: z.string().trim().min(1).max(30) }),
  z.object({ email: z.email().trim().toLowerCase() }),
]);

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const invitationIdParamsSchema = z.object({
  invitationId: z.uuid("Invitation ID must be a valid UUID"),
});
