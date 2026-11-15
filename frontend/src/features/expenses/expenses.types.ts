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

export interface UpdateExpensePayload extends CreateExpensePayload {
  version: number;
}

export interface DeleteExpensePayload {
  version: number;
}

export interface ExpensePayer {
  userId: string;
  amountMinor: number;
}

export interface ExpenseSplit {
  userId: string;
  amountMinor: number;
  percentUnits?: number | string | null;
}

export interface ExpenseItem {
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
  payers: ExpensePayer[];
  splits: ExpenseSplit[];
}

export type CreatedExpense = ExpenseItem;
export type CreatedExpensePayer = ExpensePayer;
export type CreatedExpenseSplit = ExpenseSplit;

export interface ExpenseListPagination {
  nextCursor: string | null;
}

export interface ExpenseListResponse {
  message: string;
  data: ExpenseItem[];
  pagination: ExpenseListPagination;
}

export interface ExpenseRevisionSnapshot {
  id: string;
  groupId: string;
  description: string;
  category: string | null;
  amount: string;
  splitType: SplitType;
  expenseDate: string;
  version: number;
  createdById: string;
  deletedAt: string | null;
  deletedById: string | null;
  payers: Array<{ userId: string; amount: string }>;
  splits: Array<{ userId: string; amount: string; percentUnits: string | null }>;
}

export interface ExpenseRevisionChanges {
  type: "CREATED" | "UPDATED" | "DELETED";
  fromVersion?: number;
  toVersion?: number;
}

export interface ExpenseRevision {
  revision: number;
  snapshot: ExpenseRevisionSnapshot;
  changes: ExpenseRevisionChanges;
  createdById: string;
  createdAt: string;
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

