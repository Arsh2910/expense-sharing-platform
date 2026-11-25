import { useQueries, useQuery } from "@tanstack/react-query";
import { balancesApi } from "./balances.api";

export const balancesKeys = {
  all: ["balances"] as const,
  group: (groupId: string) => [...balancesKeys.all, "group", groupId] as const,
};

function groupBalanceOptions(groupId: string | undefined) {
  return {
    queryKey: balancesKeys.group(groupId ?? ""),
    queryFn: async () => {
      if (!groupId) throw new Error("Group ID is required to fetch balances");
      const res = await balancesApi.getGroupBalances(groupId);
      return res.data;
    },
  };
}

export function useGroupBalancesQuery(groupId: string | undefined, enabled = true) {
  return useQuery({ ...groupBalanceOptions(groupId), enabled: Boolean(groupId) && enabled });
}

export function useGroupsBalances(groupIds: string[]) {
  return useQueries({ queries: groupIds.map(groupBalanceOptions) });
}

