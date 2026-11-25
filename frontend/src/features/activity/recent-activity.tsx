import { useQueries } from "@tanstack/react-query";
import { Activity, ArrowLeftRight, Receipt, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils/format";
import type { GroupSummary } from "@/types/api";
import { listGroupActivity } from "./activity.api";
import { activityDetails } from "./activity-details";

export function RecentActivity({ groups, userId, limit = 30 }: {
  groups: GroupSummary[];
  userId: string;
  limit?: number;
}) {
  const queries = useQueries({
    queries: groups.map((group) => ({
      queryKey: ["group-activity", userId, group.id, "latest"],
      queryFn: () => listGroupActivity(group.id),
      staleTime: 0,
    })),
  });
  const events = queries.flatMap((query, index) =>
    query.data?.data.map((event) => ({ event, group: groups[index] })) ?? [],
  ).sort((a, b) => b.event.createdAt.localeCompare(a.event.createdAt)).slice(0, limit);
  const pending = queries.some((query) => query.isPending);
  const failed = queries.some((query) => query.isError);

  return (
    <section aria-label="Recent financial and group activity">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold tracking-tight">Recent activity</h2>
        {limit === 4 && <Link className="text-sm font-semibold text-accent hover:underline" to="/activity">View activity</Link>}
      </div>
      {pending && <p role="status" className="sr-only">Loading activity…</p>}
      {pending && events.length === 0 && (
        <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-start gap-3 px-4 py-3.5">
              <Skeleton className="size-8 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-32 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      )}
      {failed && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
          <p>Some group activity couldn’t load.</p>
          <Button variant="outline" size="sm" onClick={() => {
            for (const query of queries) if (query.isError) void query.refetch();
          }}>Retry</Button>
        </div>
      )}
      {!pending && !failed && !events.length && <p className="text-sm text-ink-secondary">No group activity yet.</p>}
      {!!events.length && (
        <ol className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface">
          {events.map(({ event, group }) => {
            const Icon = event.action.startsWith("EXPENSE_") ? Receipt
              : event.action.startsWith("SETTLEMENT_") ? ArrowLeftRight
              : event.action.startsWith("MEMBER_") || event.action.startsWith("INVITATION_") ? Users
              : Activity;
            const details = activityDetails(event);
            return (
              <li key={`${group.id}:${event.id}`} className="flex items-start gap-3 px-4 py-3.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-panel text-accent"><Icon className="size-4" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm"><strong>{event.actor?.displayName ?? "A group member"}</strong> {details.summary}</p>
                  {details.detail && <p className="mt-0.5 break-words text-xs text-ink-secondary">{details.detail}</p>}
                  <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-ink-secondary">
                    <Link className="font-semibold text-accent hover:underline" to={`/groups/${group.id}?tab=activity`}>{group.name}</Link>
                    <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
