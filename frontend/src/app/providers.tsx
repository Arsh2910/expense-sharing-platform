import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/features/auth/auth-context";
import { isApiError } from "@/lib/api/errors";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (
            isApiError(error) &&
            (error.status === 400 ||
              error.status === 401 ||
              error.status === 403 ||
              error.status === 404 ||
              error.status === 409)
          ) {
            return false;
          }
          return failureCount < 1;
        },
      },
    },
  });
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

