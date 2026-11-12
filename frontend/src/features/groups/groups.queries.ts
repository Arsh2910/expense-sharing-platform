import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { groupsApi } from "@/features/groups/groups.api";
import type {
  AddGroupMemberPayload,
  CreateGroupPayload,
} from "@/features/groups/groups.api";

export const groupsKeys = {
  all: ["groups"] as const,
  list: () => [...groupsKeys.all, "list"] as const,
  members: (groupId: string) => [...groupsKeys.all, "members", groupId] as const,
};

export function useMyGroupsQuery() {
  return useQuery({
    queryKey: groupsKeys.list(),
    queryFn: () => groupsApi.listMyGroups(),
  });
}

export function useGroupMembersQuery(groupId: string | undefined) {
  return useQuery({
    queryKey: groupsKeys.members(groupId ?? ""),
    queryFn: () => groupsApi.listGroupMembers(groupId!),
    enabled: Boolean(groupId),
    retry: false,
  });
}

export function useCreateGroupMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateGroupPayload) => groupsApi.createGroup(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupsKeys.all });
    },
  });
}

export function useAddGroupMemberMutation(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AddGroupMemberPayload) =>
      groupsApi.addGroupMember(groupId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: groupsKeys.members(groupId),
      });
    },
  });
}

