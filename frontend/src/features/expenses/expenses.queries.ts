import { useMutation, useQueryClient } from "@tanstack/react-query";
import { groupsKeys } from "@/features/groups/groups.queries";
import { expensesApi } from "./expenses.api";
import type { CreateExpensePayload } from "./expenses.types";

export const expensesKeys = {
  all: ["expenses"] as const,
  group: (groupId: string) => [...expensesKeys.all, "group", groupId] as const,
};

export function useCreateExpenseMutation(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateExpensePayload) =>
      expensesApi.createExpense(groupId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupsKeys.all });
      void queryClient.invalidateQueries({
        queryKey: groupsKeys.details(groupId),
      });
      void queryClient.invalidateQueries({
        queryKey: groupsKeys.members(groupId),
      });
    },
  });
}

