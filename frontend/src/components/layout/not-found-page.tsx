import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you requested does not exist or may have moved."
        action={
          <Button asChild>
            <Link to="/">Return to Overview</Link>
          </Button>
        }
        className="w-full max-w-md bg-white"
      />
    </div>
  );
}

