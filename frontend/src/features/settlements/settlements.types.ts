export interface Settlement {
  id: string;
  groupId: string;
  currency: string;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  settledOn: string; // YYYY-MM-DD
  note: string | null;
  reversesId: string | null;
  createdById: string;
  createdAt: string;
}

export interface CreateSettlementPayload {
  fromUserId: string;
  toUserId: string;
  amount: string; // Plain decimal string
  settledOn: string; // YYYY-MM-DD
  note?: string;
}

