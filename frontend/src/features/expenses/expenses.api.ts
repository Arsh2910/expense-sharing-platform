import { apiRequest } from "@/lib/api/client";
import type { ApiSuccessResponse } from "@/types/api";
import type {
  CreateExpensePayload,
  CreatedExpense,
} from "./expenses.types";

export const expensesApi = {
  async createExpense(
    groupId: string,
    payload: CreateExpensePayload,
  ): Promise<ApiSuccessResponse<CreatedExpense>> {
    return apiRequest<ApiSuccessResponse<CreatedExpense>>(
      `/api/groups/${encodeURIComponent(groupId)}/expenses`,
      {
        method: "POST",
        body: payload,
      },
    );
  },
};

