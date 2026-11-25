import { useInfiniteQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils/format";
import { activityDetails } from "./activity-details";
import { listGroupActivity } from "./activity.api";

export function GroupActivity({ groupId }: { groupId: string }) {
  const { user } = useAuth();
  const activity = useInfiniteQuery({
    queryKey: ["group-activity", user?.id, groupId],
    queryFn: ({ pageParam }) => listGroupActivity(groupId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.pagination.nextCursor ?? undefined,
    enabled: Boolean(user),
  });
  const events = activity.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <Card>
      <CardHeader><CardTitle>Group activity</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {activity.isPending && (
          <>
            <p role="status" className="sr-only">Loading activity…</p>
            <div className="divide-y divide-border-subtle">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 py-3 first:pt-0">
                  <Skeleton className="h-4 w-48 max-w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          </>
        )}
        {activity.isError && (
          <div className="space-y-2">
            <Alert variant="error">{getErrorMessage(activity.error)}</Alert>
            {!activity.isFetchNextPageError && (
              <Button size="sm" variant="outline" onClick={() => { void activity.refetch(); }}>Retry</Button>
            )}
          </div>
        )}
        {activity.isSuccess && events.length === 0 && (
          <EmptyState icon={Activity} title="No group activity yet"
            description="The feed shows actions recorded after activity tracking was enabled." />
        )}
        {events.length > 0 && (
          <ol className="divide-y divide-border-subtle">
            {events.map((event) => {
              const details = activityDetails(event);
              return (
                <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0">
                  <div className="min-w-0 break-words text-sm">
                    <p><strong>{event.actor?.displayName ?? "Unknown actor"}</strong> {details.summary}</p>
                    {details.detail && <p className="mt-1 text-ink-secondary">{details.detail}</p>}
                  </div>
                  <time dateTime={event.createdAt} className="text-xs text-ink-secondary">
                    {formatDateTime(event.createdAt)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
        {activity.hasNextPage && (
          <Button variant="outline" isLoading={activity.isFetchingNextPage}
            onClick={() => { void activity.fetchNextPage(); }}>
            {activity.isFetchNextPageError ? "Retry loading more" : "Load more"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
