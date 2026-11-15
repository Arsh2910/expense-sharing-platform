import { z } from "zod";

const userIdSchema = z.uuid("User ID must be a valid UUID");
const amountSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)(?:\.\d+)?$/,
    "Amount must be a non-negative plain decimal string",
  );

const payerSchema = z
  .object({
    userId: userIdSchema,
    amount: amountSchema,
  })
  .strict();

const equalSplitSchema = z
  .object({
    type: z.literal("EQUAL"),
    participants: z.array(userIdSchema).min(1).max(50),
  })
  .strict();

const exactSplitSchema = z
  .object({
    type: z.literal("EXACT"),
    participants: z
      .array(
        z
          .object({
            userId: userIdSchema,
            amount: amountSchema,
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

const percentageSchema = z
  .string()
  .regex(
    /^(?:100(?:\.0{1,6})?|(?:0|[1-9]\d?)(?:\.\d{1,6})?)$/,
    "Percentage must be between 0 and 100 with at most 6 decimal places",
  );

const percentageSplitSchema = z
  .object({
    type: z.literal("PERCENTAGE"),
    participants: z
      .array(
        z
          .object({
            userId: userIdSchema,
            percentage: percentageSchema,
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

const expenseInputShape = {
  description: z.string().trim().min(1).max(500),
  category: z.string().trim().min(1).max(50).optional(),
  expenseDate: z.iso.date(),
  total: amountSchema.optional(),
  payers: z.array(payerSchema).min(1).max(50),
  split: z.discriminatedUnion("type", [
    equalSplitSchema,
    exactSplitSchema,
    percentageSplitSchema,
  ]),
};

function hasDuplicates(values: readonly string[]) {
  return new Set(values).size !== values.length;
}

function validateUniqueAllocations(
  input: {
    payers: readonly { userId: string }[];
    split: {
      participants: readonly (string | { userId: string })[];
    };
  },
  context: z.RefinementCtx,
) {
  if (hasDuplicates(input.payers.map((payer) => payer.userId))) {
    context.addIssue({
      code: "custom",
      path: ["payers"],
      message: "A payer can appear only once",
    });
  }

  const participantIds = input.split.participants.map((participant) =>
    typeof participant === "string" ? participant : participant.userId,
  );
  if (hasDuplicates(participantIds)) {
    context.addIssue({
      code: "custom",
      path: ["split", "participants"],
      message: "A participant can appear only once",
    });
  }
}

export const createExpenseSchema = z
  .object(expenseInputShape)
  .strict()
  .superRefine(validateUniqueAllocations);

export const updateExpenseSchema = z
  .object({
    ...expenseInputShape,
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine(validateUniqueAllocations);

export const deleteExpenseSchema = z
  .object({
    version: z.number().int().positive(),
  })
  .strict();

export const expenseGroupParamsSchema = z.object({
  groupId: z.uuid("Group ID must be a valid UUID"),
});

export const expenseParamsSchema = z.object({
  groupId: z.uuid("Group ID must be a valid UUID"),
  expenseId: z.uuid("Expense ID must be a valid UUID"),
});

export const listExpensesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.uuid("Cursor must be a valid UUID").optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
