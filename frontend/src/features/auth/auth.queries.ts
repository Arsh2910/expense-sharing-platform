import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/errors";
import { authApi, isPublicUser } from "@/features/auth/auth.api";
import type {
  ChangeEmailPayload,
  ChangePasswordPayload,
  DeleteAccountPayload,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload,
  VerifyEmailPayload,
} from "@/features/auth/auth.api";

export const authKeys = {
  me: ["auth", "me"] as const,
};

export function useCurrentUserQuery() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async () => {
      try {
        return await authApi.getMe();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) {
        return false;
      }
      return failureCount < 1;
    },
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const response = await authApi.login(payload);
      if (!isPublicUser(response.data)) {
        throw new ApiError({
          message:
            "Unexpected login response from server. Ensure the latest backend server is running.",
          status: 502,
          kind: "server",
        });
      }
      return response;
    },
    onSuccess: (response) => {
      queryClient.setQueryData(authKeys.me, response.data);
    },
  });
}

export function useRegisterMutation() {
  return useMutation({
    mutationFn: (payload: RegisterPayload) => authApi.register(payload),
  });
}

export function useVerifyEmailMutation() {
  return useMutation({
    mutationFn: (payload: VerifyEmailPayload) => authApi.verifyEmail(payload),
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      queryClient.setQueryData(authKeys.me, null);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "auth",
      });
    },
  });
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => authApi.updateProfile(payload),
    onSuccess: (response) => {
      queryClient.setQueryData(authKeys.me, response.data);
    },
  });
}

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: (payload: ChangePasswordPayload) =>
      authApi.changePassword(payload),
  });
}

export function useChangeEmailMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ChangeEmailPayload) => authApi.changeEmail(payload),
    onSuccess: (response) => {
      queryClient.setQueryData(authKeys.me, response.data);
    },
  });
}

export function useDeleteAccountMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DeleteAccountPayload) => authApi.deleteAccount(payload),
    onSuccess: () => {
      queryClient.setQueryData(authKeys.me, null);
      queryClient.clear();
    },
  });
}

