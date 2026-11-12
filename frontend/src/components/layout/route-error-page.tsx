import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function RouteErrorPage() {
  const error = useRouteError();

  let title = "Something went wrong";
  let description =
    "An unexpected error interrupted this view. Try reloading the page or returning to Overview.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} — ${error.statusText || "Request error"}`;
    if (typeof error.data === "string" && error.data) {
      description = error.data;
    }
  } else if (error instanceof Error && error.message) {
    description = error.message;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAF9F6] px-4">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-[#E7E5E0] bg-white p-7 shadow-xs">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold tracking-tight text-[#18181B]">
            {title}
          </h1>
          <p className="text-sm text-[#52525B] leading-relaxed">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload page
          </Button>
          <Button asChild variant="outline">
            <Link to="/">
              <Home className="h-4 w-4" aria-hidden="true" />
              Overview
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

