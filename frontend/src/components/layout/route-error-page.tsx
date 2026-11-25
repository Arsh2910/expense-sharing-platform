import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";
import { NotFoundPage } from "./not-found-page";
import { Button } from "@/components/ui/button";

export function RouteErrorPage() {
  const error = useRouteError();

  const status = isRouteErrorResponse(error) ? error.status : undefined;
  if (status === 404) return <NotFoundPage />;

  const title = status === 403 ? "You don’t have access to this page" : "This page couldn’t load";
  const description = status === 403
    ? "Return to Overview to find the groups and activity you can access."
    : "Try reloading the page. If the issue continues, you can return to Overview.";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-subtle px-4">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border-subtle bg-surface p-7 shadow-xs">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="text-sm text-ink-secondary leading-relaxed">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {status !== 403 && (
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reload page
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/" reloadDocument>
              <Home className="h-4 w-4" aria-hidden="true" />
              Overview
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

