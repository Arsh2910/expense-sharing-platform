import { apiRequest } from "@/lib/api/client";
import type {
  ApiSuccessResponse,
  CreatedGroup,
  GroupDetails,
  GroupMember,
  GroupRole,
  GroupSummary,
  RemoveMemberResult,
  UpdatedGroup,
} from "@/types/api";

export interface CreateGroupPayload {
  name: string;
  currency: string;
}

export interface UpdateGroupPayload {
  name: string;
}

export interface AddGroupMemberPayload {
  email: string;
}

export interface UpdateMemberRolePayload {
  role: GroupRole;
}

export const groupsApi = {
  async listMyGroups(): Promise<GroupSummary[]> {
    const res = await apiRequest<ApiSuccessResponse<GroupSummary[]>>(
      "/api/groups",
      { method: "GET" },
    );
    return res.data;
  },

  async createGroup(
    payload: CreateGroupPayload,
  ): Promise<ApiSuccessResponse<CreatedGroup>> {
    return apiRequest<ApiSuccessResponse<CreatedGroup>>("/api/groups", {
      method: "POST",
      body: payload,
    });
  },

  async getGroupDetails(groupId: string): Promise<GroupDetails> {
    const res = await apiRequest<ApiSuccessResponse<GroupDetails>>(
      `/api/groups/${encodeURIComponent(groupId)}`,
      { method: "GET" },
    );
    return res.data;
  },

  async updateGroup(
    groupId: string,
    payload: UpdateGroupPayload,
  ): Promise<ApiSuccessResponse<UpdatedGroup>> {
    return apiRequest<ApiSuccessResponse<UpdatedGroup>>(
      `/api/groups/${encodeURIComponent(groupId)}`,
      {
        method: "PATCH",
        body: payload,
      },
    );
  },

  async archiveGroup(groupId: string): Promise<ApiSuccessResponse<UpdatedGroup>> {
    return apiRequest<ApiSuccessResponse<UpdatedGroup>>(
      `/api/groups/${encodeURIComponent(groupId)}`,
      {
        method: "DELETE",
      },
    );
  },

  async listGroupMembers(groupId: string): Promise<GroupMember[]> {
    const res = await apiRequest<ApiSuccessResponse<GroupMember[]>>(
      `/api/groups/${encodeURIComponent(groupId)}/members`,
      { method: "GET" },
    );
    return res.data;
  },

  async addGroupMember(
    groupId: string,
    payload: AddGroupMemberPayload,
  ): Promise<ApiSuccessResponse<GroupMember>> {
    return apiRequest<ApiSuccessResponse<GroupMember>>(
      `/api/groups/${encodeURIComponent(groupId)}/members`,
      {
        method: "POST",
        body: payload,
      },
    );
  },

  async removeMember(
    groupId: string,
    targetUserId: string,
  ): Promise<ApiSuccessResponse<RemoveMemberResult>> {
    return apiRequest<ApiSuccessResponse<RemoveMemberResult>>(
      `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(targetUserId)}`,
      {
        method: "DELETE",
      },
    );
  },

  async updateMemberRole(
    groupId: string,
    targetUserId: string,
    payload: UpdateMemberRolePayload,
  ): Promise<ApiSuccessResponse<GroupMember>> {
    return apiRequest<ApiSuccessResponse<GroupMember>>(
      `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(targetUserId)}`,
      {
        method: "PATCH",
        body: payload,
      },
    );
  },
};
