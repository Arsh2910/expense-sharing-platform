import { z } from "zod";

const amountSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)(?:\.\d+)?$/,
    "Amount must be a non-negative plain decimal string",
  );

export const createSettlementSchema = z
  .object({
    fromUserId: z.uuid("Payer user ID must be a valid UUID"),
    toUserId: z.uuid("Recipient user ID must be a valid UUID"),
    amount: amountSchema,
    settledOn: z.iso.date(),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const settlementGroupParamsSchema = z.object({
  groupId: z.uuid("Group ID must be a valid UUID"),
});

export const settlementParamsSchema = z.object({
  groupId: z.uuid("Group ID must be a valid UUID"),
  settlementId: z.uuid("Settlement ID must be a valid UUID"),
});

export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
