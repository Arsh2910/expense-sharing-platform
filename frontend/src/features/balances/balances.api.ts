import { apiRequest } from "@/lib/api/client";
import type { ApiSuccessResponse } from "@/types/api";
import type { GroupBalancesData } from "./balances.types";

export const balancesApi = {
  async getGroupBalances(
    groupId: string,
  ): Promise<ApiSuccessResponse<GroupBalancesData>> {
    return apiRequest<ApiSuccessResponse<GroupBalancesData>>(
      `/api/groups/${encodeURIComponent(groupId)}/balances`,
    );
  },
};

