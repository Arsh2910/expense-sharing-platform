import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { balancesKeys } from "@/features/balances/balances.queries";
import { groupsKeys } from "@/features/groups/groups.queries";
import { expensesApi } from "./expenses.api";
import type {
  CreateExpensePayload,
  DeleteExpensePayload,
  UpdateExpensePayload,
} from "./expenses.types";

export const expensesKeys = {
  all: ["expenses"] as const,
  lists: () => [...expensesKeys.all, "list"] as const,
  list: (groupId: string) => [...expensesKeys.lists(), groupId] as const,
  details: () => [...expensesKeys.all, "detail"] as const,
  detail: (groupId: string, expenseId: string) =>
    [...expensesKeys.details(), groupId, expenseId] as const,
  revisions: () => [...expensesKeys.all, "revisions"] as const,
  revision: (groupId: string, expenseId: string) =>
    [...expensesKeys.revisions(), groupId, expenseId] as const,
};

export function useExpensesInfiniteQuery(
  groupId: string | undefined,
  limit = 20,
) {
  return useInfiniteQuery({
    queryKey: expensesKeys.list(groupId ?? ""),
    queryFn: async ({ pageParam }) => {
      if (!groupId) throw new Error("Group ID is required");
      return expensesApi.listExpenses(groupId, {
        limit,
        cursor: pageParam,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor ?? undefined,
    enabled: Boolean(groupId),
  });
}

export function useExpenseDetailsQuery(
  groupId: string | undefined,
  expenseId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: expensesKeys.detail(groupId ?? "", expenseId ?? ""),
    queryFn: async () => {
      if (!groupId || !expenseId) {
        throw new Error("Group ID and Expense ID are required");
      }
      const res = await expensesApi.getExpense(groupId, expenseId);
      return res.data;
    },
    enabled: Boolean(groupId) && Boolean(expenseId) && enabled,
  });
}

export function useExpenseRevisionsQuery(
  groupId: string | undefined,
  expenseId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: expensesKeys.revision(groupId ?? "", expenseId ?? ""),
    queryFn: async () => {
      if (!groupId || !expenseId) {
        throw new Error("Group ID and Expense ID are required");
      }
      const res = await expensesApi.listExpenseRevisions(groupId, expenseId);
      return res.data;
    },
    enabled: Boolean(groupId) && Boolean(expenseId) && enabled,
  });
}

export function useCreateExpenseMutation(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateExpensePayload) =>
      expensesApi.createExpense(groupId, payload),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({
        queryKey: expensesKeys.list(groupId),
      });
      void queryClient.invalidateQueries({
        queryKey: balancesKeys.group(groupId),
      });
      void queryClient.invalidateQueries({
        queryKey: groupsKeys.details(groupId),
      });
      return response;
    },
  });
}

export function useUpdateExpenseMutation(groupId: string, expenseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateExpensePayload) =>
      expensesApi.updateExpense(groupId, expenseId, payload),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({
        queryKey: expensesKeys.list(groupId),
      });
      void queryClient.invalidateQueries({
        queryKey: expensesKeys.detail(groupId, expenseId),
      });
      void queryClient.invalidateQueries({
        queryKey: expensesKeys.revision(groupId, expenseId),
      });
      void queryClient.invalidateQueries({
        queryKey: balancesKeys.group(groupId),
      });
      void queryClient.invalidateQueries({
        queryKey: groupsKeys.details(groupId),
      });
      return response;
    },
  });
}

export function useDeleteExpenseMutation(groupId: string, expenseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DeleteExpensePayload) =>
      expensesApi.deleteExpense(groupId, expenseId, payload),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({
        queryKey: expensesKeys.list(groupId),
      });
      void queryClient.invalidateQueries({
        queryKey: expensesKeys.detail(groupId, expenseId),
      });
      void queryClient.invalidateQueries({
        queryKey: expensesKeys.revision(groupId, expenseId),
      });
      void queryClient.invalidateQueries({
        queryKey: balancesKeys.group(groupId),
      });
      void queryClient.invalidateQueries({
        queryKey: groupsKeys.details(groupId),
      });
      return response;
    },
  });
}
