import { Activity, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ComingSoonPanel } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function ActivityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        description="Chronological history of expenses, balance changes, settlements, and group events across your account."
        actions={
          <Button asChild variant="outline">
            <Link to="/groups">
              Go to My Groups
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      />

      <ComingSoonPanel
        icon={Activity}
        title="Account activity feed"
        description="Once the Expense, Settlement, and Activity History endpoints are implemented on the backend, every financial event and group change will appear here in chronological order with full audit details."
        detail="No mock activity is displayed so your ledger remains strictly factual."
      />
    </div>
  );
}

