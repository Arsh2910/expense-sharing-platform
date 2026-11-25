import { useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { BrandMark } from "@/features/auth/auth-layout";

function SessionLoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-subtle px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border-subtle bg-surface p-7 shadow-xs">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-7 w-7" />
          <span className="text-base font-semibold tracking-tight text-ink">
            SplitCircle
          </span>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-9 w-full" />
        </div>
        <p role="status" className="text-xs text-ink-muted">Verifying your session…</p>
      </div>
    </div>
  );
}

function SessionErrorScreen({
  onRetry,
}: {
  onRetry: () => Promise<unknown>;
}) {
  const [isRetrying, setIsRetrying] = useState(false);

  async function retry() {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-subtle px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border-subtle bg-surface p-7 shadow-xs">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700">
          <WifiOff className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-ink">
            We couldn’t verify your session
          </h1>
          <p className="text-sm text-ink-secondary leading-relaxed">
            Check your connection and try again to continue to SplitCircle.
          </p>
        </div>
        <Button isLoading={isRetrying} onClick={() => { void retry(); }}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry connection
        </Button>
      </div>
    </div>
  );
}

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, isError, refetchSession } =
    useAuth();
  const location = useLocation();

  if (isLoading) {
    return <SessionLoadingScreen />;
  }

  if (isError) {
    return <SessionErrorScreen onRetry={refetchSession} />;
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
