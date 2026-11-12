import { RefreshCw, WifiOff } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { BrandMark } from "@/features/auth/auth-layout";
import { isApiError } from "@/lib/api/errors";

function SessionLoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAF9F6] px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-[#E7E5E0] bg-white p-7 shadow-xs">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-7 w-7" />
          <span className="text-base font-semibold tracking-tight text-[#18181B]">
            ClearLedger
          </span>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-9 w-full" />
        </div>
        <p className="text-xs text-[#71717A]">Verifying your session...</p>
      </div>
    </div>
  );
}

function SessionErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAF9F6] px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-[#E7E5E0] bg-white p-7 shadow-xs">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700">
          <WifiOff className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-[#18181B]">
            Unable to connect to the server
          </h1>
          <p className="text-sm text-[#52525B] leading-relaxed">{message}</p>
        </div>
        <Button onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry connection
        </Button>
      </div>
    </div>
  );
}

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, isError, error, refetchSession } =
    useAuth();
  const location = useLocation();

  if (isLoading) {
    return <SessionLoadingScreen />;
  }

  if (isError) {
    const isNotFound = isApiError(error) && error.status === 404;
    return (
      <SessionErrorScreen
        message={
          isNotFound
            ? "The session endpoint (/api/auth/me) returned 404. Verify that the latest backend server is running on port 5000."
            : (error?.message ??
              "We could not verify your session right now. Please try again.")
        }
        onRetry={() => {
          void refetchSession();
        }}
      />
    );
  }

  if (!isAuthenticated) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <SessionLoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
