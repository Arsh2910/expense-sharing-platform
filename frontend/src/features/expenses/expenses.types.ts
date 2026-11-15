export type SplitType = "EQUAL" | "EXACT" | "PERCENTAGE";

export interface PayerPayload {
  userId: string;
  amount: string;
}

export interface EqualSplitPayload {
  type: "EQUAL";
  participants: string[];
}

export interface ExactSplitParticipantPayload {
  userId: string;
  amount: string;
}

export interface ExactSplitPayload {
  type: "EXACT";
  participants: ExactSplitParticipantPayload[];
}

export interface PercentageSplitParticipantPayload {
  userId: string;
  percentage: string;
}

export interface PercentageSplitPayload {
  type: "PERCENTAGE";
  participants: PercentageSplitParticipantPayload[];
}

export type SplitPayload =
  | EqualSplitPayload
  | ExactSplitPayload
  | PercentageSplitPayload;

export interface CreateExpensePayload {
  description: string;
  category?: string;
  expenseDate: string; // YYYY-MM-DD
  total?: string;
  payers: PayerPayload[];
  split: SplitPayload;
}

export interface CreatedExpensePayer {
  userId: string;
  amountMinor: number;
}

export interface CreatedExpenseSplit {
  userId: string;
  amountMinor: number;
  percentUnits?: number | string | null;
}

export interface CreatedExpense {
  id: string;
  groupId: string;
  currency: string;
  description: string;
  category?: string | null;
  totalMinor: number;
  splitType: SplitType;
  expenseDate: string;
  version: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  payers: CreatedExpensePayer[];
  splits: CreatedExpenseSplit[];
}

export const EXPENSE_CATEGORIES: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "FOOD", label: "Food & Drinks" },
  { value: "TRANSPORTATION", label: "Transportation" },
  { value: "ACCOMMODATION", label: "Accommodation" },
  { value: "ENTERTAINMENT", label: "Entertainment & Leisure" },
  { value: "SHOPPING", label: "Shopping" },
  { value: "UTILITIES", label: "Utilities & Bills" },
  { value: "GENERAL", label: "General / Other" },
];

