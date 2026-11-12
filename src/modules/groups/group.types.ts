export type GroupRole = "OWNER" | "ADMIN" | "MEMBER";

export interface GroupDetailsResponse {
  id: string;
  name: string;
  currency: string;
  createdAt: Date;
  archivedAt: Date | null;
  memberCount: number;
  myRole: GroupRole;
}

export interface GroupMemberItem {
  id: string;
  role: GroupRole;
  joinedAt: Date;
  user: {
    id: string;
    username: string;
    displayName: string;
  };
}
