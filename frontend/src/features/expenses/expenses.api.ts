import { apiRequest } from "@/lib/api/client";
import type { ApiSuccessResponse } from "@/types/api";
import type {
  CreateExpensePayload,
  DeleteExpensePayload,
  ExpenseItem,
  ExpenseListResponse,
  ExpenseRevision,
  UpdateExpensePayload,
} from "./expenses.types";

export const expensesApi = {
  async listExpenses(
    groupId: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<ExpenseListResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiRequest<ExpenseListResponse>(
      `/api/groups/${encodeURIComponent(groupId)}/expenses${query}`,
    );
  },

  async getExpense(
    groupId: string,
    expenseId: string,
  ): Promise<ApiSuccessResponse<ExpenseItem>> {
    return apiRequest<ApiSuccessResponse<ExpenseItem>>(
      `/api/groups/${encodeURIComponent(groupId)}/expenses/${encodeURIComponent(expenseId)}`,
    );
  },

  async listExpenseRevisions(
    groupId: string,
    expenseId: string,
  ): Promise<ApiSuccessResponse<ExpenseRevision[]>> {
    return apiRequest<ApiSuccessResponse<ExpenseRevision[]>>(
      `/api/groups/${encodeURIComponent(groupId)}/expenses/${encodeURIComponent(expenseId)}/revisions`,
    );
  },

  async createExpense(
    groupId: string,
    payload: CreateExpensePayload,
  ): Promise<ApiSuccessResponse<ExpenseItem>> {
    return apiRequest<ApiSuccessResponse<ExpenseItem>>(
      `/api/groups/${encodeURIComponent(groupId)}/expenses`,
      {
        method: "POST",
        useClientTimeZone: true,
        body: payload,
      },
    );
  },

  async updateExpense(
    groupId: string,
    expenseId: string,
    payload: UpdateExpensePayload,
  ): Promise<ApiSuccessResponse<ExpenseItem>> {
    return apiRequest<ApiSuccessResponse<ExpenseItem>>(
      `/api/groups/${encodeURIComponent(groupId)}/expenses/${encodeURIComponent(expenseId)}`,
      {
        method: "PATCH",
        useClientTimeZone: true,
        body: payload,
      },
    );
  },

  async deleteExpense(
    groupId: string,
    expenseId: string,
    payload: DeleteExpensePayload,
  ): Promise<ApiSuccessResponse<{ id: string; version: number; deletedAt: string }>> {
    return apiRequest<ApiSuccessResponse<{ id: string; version: number; deletedAt: string }>>(
      `/api/groups/${encodeURIComponent(groupId)}/expenses/${encodeURIComponent(expenseId)}`,
      {
        method: "DELETE",
        body: payload,
      },
    );
  },
};
