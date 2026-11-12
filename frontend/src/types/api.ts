export type UserStatus = "ACTIVE" | "DEACTIVATED";

export type GroupRole = "OWNER" | "ADMIN" | "MEMBER";

export interface PublicUser {
  id: string;
  email: string;
  username: string | null;
  displayName: string;
  status: UserStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface GroupMembershipSummary {
  role: GroupRole;
  joinedAt: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  memberships: GroupMembershipSummary[];
}

export interface GroupMemberUser {
  id: string;
  username: string | null;
  displayName: string;
}

export interface GroupMember {
  id: string;
  role: GroupRole;
  joinedAt: string;
  user: GroupMemberUser;
}

export interface CreatedGroupMembership {
  id: string;
  userId: string;
  groupId: string;
  role: GroupRole;
  joinedAt: string;
  leftAt: string | null;
  user: GroupMemberUser;
}

export interface CreatedGroup {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  archivedAt: string | null;
  memberships: CreatedGroupMembership[];
}

export interface GroupDetails {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  archivedAt: string | null;
  memberCount: number;
  myRole: GroupRole;
}

export interface UpdatedGroup {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  archivedAt: string | null;
}

export interface RemoveMemberResult {
  groupId: string;
  removedUserId: string;
  leftAt: string;
  successorUserId: string | null;
  groupArchived: boolean;
}

export interface ApiSuccessResponse<T> {
  message?: string;
  data: T;
}

export interface ApiMessageResponse {
  message: string;
}

export interface BackendValidationIssue {
  path?: Array<string | number>;
  message: string;
  code?: string;
}

export interface ApiErrorPayload {
  message?: string;
  errors?: BackendValidationIssue[];
}

