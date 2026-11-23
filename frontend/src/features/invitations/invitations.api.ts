import { apiRequest } from "@/lib/api/client";
import type { ApiSuccessResponse } from "@/types/api";

export interface Invitation {
  id: string;
  groupId: string;
  group: { name: string; currency: string };
  invitedUser: { username: string | null; displayName: string } | null;
  invitedEmail: string | null;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
}

type InviteTarget = { username: string } | { email: string };
const groupInvitationsPath = (groupId: string) => `/api/groups/${encodeURIComponent(groupId)}/invitations`;

export const invitationsKeys = {
  inbox: (userId: string) => ["invitations", "inbox", userId] as const,
  group: (groupId: string) => ["invitations", "group", groupId] as const,
};

export const invitationsApi = {
  async listMine() {
    const result = await apiRequest<ApiSuccessResponse<Invitation[]>>("/api/invitations");
    return result.data;
  },

  async listGroup(groupId: string) {
    const result = await apiRequest<ApiSuccessResponse<Invitation[]>>(groupInvitationsPath(groupId));
    return result.data;
  },

  async create(groupId: string, target: InviteTarget) {
    return apiRequest<ApiSuccessResponse<Invitation>>(groupInvitationsPath(groupId), {
      method: "POST",
      body: target,
    });
  },

  async manage(groupId: string, id: string, action: "resend" | "revoke") {
    return apiRequest<ApiSuccessResponse<Invitation>>(
      `${groupInvitationsPath(groupId)}/${encodeURIComponent(id)}/${action}`,
      { method: "POST" },
    );
  },

  async respond(id: string, action: "accept" | "decline", token?: string) {
    return apiRequest<ApiSuccessResponse<{ id: string }>>(
      `/api/invitations/${encodeURIComponent(id)}/${action}`,
      { method: "POST", body: token ? { token } : {} },
    );
  },
};
