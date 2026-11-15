export type BalanceDirection = "OWES" | "RECEIVES" | "SQUARE";

export interface GroupBalanceMember {
  userId: string;
  username: string | null;
  displayName: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | null;
  isActiveMember: boolean;
  balanceMinor: number;
  direction: BalanceDirection;
  updatedAt: string;
}

export interface GroupBalancesData {
  currency: string;
  members: GroupBalanceMember[];
}

