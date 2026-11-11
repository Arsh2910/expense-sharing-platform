import { z } from "zod";

export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Group name is required")
    .max(100, "Group name cannot exceed 100 characters"),

  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Currency must be a three-letter uppercase code"),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const addGroupMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

export type AddGroupMemberInput = z.infer<typeof addGroupMemberSchema>;

export const groupParamsSchema = z.object({
  groupId: z.uuid("Group ID must be a valid UUID"),
});
