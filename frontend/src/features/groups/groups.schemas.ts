import { z } from "zod";

export const createGroupFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Group name is required")
    .max(100, "Group name cannot exceed 100 characters"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter uppercase ISO code (e.g. USD)"),
});

export type CreateGroupFormValues = z.infer<typeof createGroupFormSchema>;

export const updateGroupFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Group name is required")
    .max(100, "Group name cannot exceed 100 characters"),
});

export type UpdateGroupFormValues = z.infer<typeof updateGroupFormSchema>;


export const updateMemberRoleFormSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
});

export type UpdateMemberRoleFormValues = z.infer<typeof updateMemberRoleFormSchema>;
