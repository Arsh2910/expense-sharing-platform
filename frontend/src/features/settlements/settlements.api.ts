import { apiRequest } from "@/lib/api/client";
import type { ApiSuccessResponse } from "@/types/api";
import type { CreateSettlementPayload, Settlement } from "./settlements.types";

export const settlementsApi = {
  async listSettlements(
    groupId: string,
  ): Promise<ApiSuccessResponse<Settlement[]>> {
    return apiRequest<ApiSuccessResponse<Settlement[]>>(
      `/api/groups/${encodeURIComponent(groupId)}/settlements`,
    );
  },

  async createSettlement(
    groupId: string,
    payload: CreateSettlementPayload,
  ): Promise<ApiSuccessResponse<Settlement>> {
    return apiRequest<ApiSuccessResponse<Settlement>>(
      `/api/groups/${encodeURIComponent(groupId)}/settlements`,
      {
        method: "POST",
        useClientTimeZone: true,
        body: payload,
      },
    );
  },

  async reverseSettlement(
    groupId: string,
    settlementId: string,
  ): Promise<ApiSuccessResponse<Settlement>> {
    return apiRequest<ApiSuccessResponse<Settlement>>(
      `/api/groups/${encodeURIComponent(groupId)}/settlements/${encodeURIComponent(settlementId)}/reverse`,
      {
        method: "POST",
        useClientTimeZone: true,
      },
    );
  },
};

