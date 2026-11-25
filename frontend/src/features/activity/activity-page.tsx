import { ArrowRight, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useMyGroupsQuery } from "@/features/groups/groups.queries";
import { getErrorMessage } from "@/lib/api/errors";
import { useAuth } from "@/hooks/use-auth";
import { RecentActivity } from "./recent-activity";

export function ActivityPage() {
  const { user } = useAuth();
  const groupsQuery = useMyGroupsQuery();
  const groups = groupsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        description="Recent events across your groups. Open a group to see its full history."
      />

      {groupsQuery.isPending ? (
        <p role="status" className="text-sm text-ink-secondary">Loading your groups…</p>
      ) : groupsQuery.isError ? (
        <Alert variant="error" title="Could not load your groups">
          <div className="flex flex-wrap items-center gap-3">
            <span>{getErrorMessage(groupsQuery.error)}</span>
            <Button variant="outline" size="sm" onClick={() => { void groupsQuery.refetch(); }}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No groups yet"
          description="Your groups will appear here after you create or join one."
          action={<Button asChild variant="outline"><Link to="/groups">Go to My Groups</Link></Button>}
        />
      ) : (
        <>
        {user && <RecentActivity groups={groups} userId={user.id} />}
        <section aria-label="History by group">
        <h2 className="mb-3 text-lg font-extrabold tracking-tight">History by group</h2>
        <Card className="overflow-hidden">
          <ul aria-label="Group activity" className="divide-y divide-border-subtle">
            {groups.map((group) => (
              <li key={group.id}>
                <Link
                  to={`/groups/${group.id}?tab=activity`}
                  aria-label={`View activity for ${group.name}`}
                  className="group flex items-center gap-3 px-4 py-4 transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus sm:px-5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-panel text-action">
                    <Users className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold text-ink group-hover:text-accent">
                    {group.name}
                  </span>
                  <span className="shrink-0 text-xs text-ink-secondary">{group.currency}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-secondary group-hover:text-accent" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        </section>
        </>
      )}
    </div>
  );
}

