import { apiRequest } from "@/lib/api/client";

interface ActivityUser {
  id: string;
  displayName: string;
  username: string | null;
}

export interface GroupActivityEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: ActivityUser | null;
  targetUser: ActivityUser | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface GroupActivityPage {
  data: GroupActivityEvent[];
  pagination: { nextCursor: string | null };
}

export function listGroupActivity(groupId: string, cursor?: string) {
  const path = `/api/groups/${encodeURIComponent(groupId)}/activity`;
  return apiRequest<GroupActivityPage>(cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path);
}
