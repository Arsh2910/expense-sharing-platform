import { apiRequest } from "@/lib/api/client";
import type {
  ApiSuccessResponse,
  CreatedGroup,
  GroupMember,
  GroupSummary,
} from "@/types/api";

export interface CreateGroupPayload {
  name: string;
  currency: string;
}

export interface AddGroupMemberPayload {
  email: string;
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
};

