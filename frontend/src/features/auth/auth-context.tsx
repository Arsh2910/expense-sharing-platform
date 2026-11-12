import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthContext, type AuthContextValue } from "@/features/auth/auth-context-value";
import { authKeys, useCurrentUserQuery } from "@/features/auth/auth.queries";
import { subscribeUnauthorized } from "@/lib/api/client";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useCurrentUserQuery();

  React.useEffect(() => {
    return subscribeUnauthorized(() => {
      queryClient.setQueryData(authKeys.me, null);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "auth",
      });
    });
  }, [queryClient]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user: data ?? null,
      isLoading,
      isError,
      error: error instanceof Error ? error : null,
      isAuthenticated: Boolean(data),
      refetchSession: refetch,
    }),
    [data, isLoading, isError, error, refetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
