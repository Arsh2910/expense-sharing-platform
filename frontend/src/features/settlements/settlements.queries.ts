import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { balancesKeys } from "@/features/balances/balances.queries";
import { groupsKeys } from "@/features/groups/groups.queries";
import { settlementsApi } from "./settlements.api";
import type { CreateSettlementPayload } from "./settlements.types";

export const settlementsKeys = {
  all: ["settlements"] as const,
  lists: () => [...settlementsKeys.all, "list"] as const,
  list: (groupId: string) => [...settlementsKeys.lists(), groupId] as const,
};

export function useSettlementsQuery(
  groupId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: settlementsKeys.list(groupId ?? ""),
    queryFn: async () => {
      if (!groupId) throw new Error("Group ID is required to fetch settlements");
      const res = await settlementsApi.listSettlements(groupId);
      return res.data;
    },
    enabled: Boolean(groupId) && enabled,
  });
}

export function useCreateSettlementMutation(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateSettlementPayload) =>
      settlementsApi.createSettlement(groupId, payload),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({
        queryKey: settlementsKeys.list(groupId),
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

export function useReverseSettlementMutation(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settlementId: string) =>
      settlementsApi.reverseSettlement(groupId, settlementId),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({
        queryKey: settlementsKeys.list(groupId),
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

