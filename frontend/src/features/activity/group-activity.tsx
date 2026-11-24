import { useInfiniteQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils/format";
import { listGroupActivity, type GroupActivityEvent } from "./activity.api";

function activityDetails(event: GroupActivityEvent) {
  const metadata = event.metadata ?? {};
  const text = (key: string) => typeof metadata[key] === "string" ? metadata[key] : undefined;
  const user = event.targetUser?.displayName;
  const expense = text("description") ?? "an expense";
  const settlement = event.entityId ? `settlement ${event.entityId.slice(0, 8)}` : "a settlement";

  switch (event.action) {
    case "GROUP_CREATED": return { summary: `created ${text("name") ?? "the group"}` };
    case "GROUP_RENAMED": return { summary: `renamed ${text("fromName") ?? "the group"} to ${text("toName") ?? "a new name"}` };
    case "GROUP_ARCHIVED": return { summary: "archived the group" };
    case "MEMBER_INVITED": return { summary: `invited ${user ?? "someone"} to the group` };
    case "INVITATION_ACCEPTED": return { summary: "accepted an invitation to the group" };
    case "INVITATION_DECLINED": return { summary: "declined an invitation to the group" };
    case "INVITATION_REVOKED": return { summary: user ? `revoked the invitation for ${user}` : "revoked an invitation" };
    case "MEMBER_REMOVED": return { summary: `removed ${user ?? "a member"} from the group` };
    case "MEMBER_LEFT": return { summary: "left the group" };
    case "MEMBER_ROLE_CHANGED":
      return {
        summary: `changed the role for ${user ?? "a member"}`,
        detail: `${text("fromRole") ?? "Unknown"} → ${text("toRole") ?? "Unknown"}`,
      };
    case "EXPENSE_CREATED": return { summary: `added ${expense}` };
    case "EXPENSE_UPDATED":
      return {
        summary: `edited ${expense}`,
        detail: typeof metadata.fromVersion === "number" && typeof metadata.toVersion === "number"
          ? `Version ${metadata.fromVersion} → ${metadata.toVersion}` : undefined,
      };
    case "EXPENSE_DELETED": return { summary: `deleted ${expense}` };
    case "SETTLEMENT_CREATED": return { summary: `recorded ${settlement}` };
    case "SETTLEMENT_REVERSED": return { summary: `reversed ${settlement}` };
    default: return { summary: "recorded a group action" };
  }
}

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
        {activity.isPending && <p role="status">Loading activity…</p>}
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
          <ol className="divide-y divide-[#E7E5E0]">
            {events.map((event) => {
              const details = activityDetails(event);
              return (
                <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0">
                  <div className="min-w-0 break-words text-sm">
                    <p><strong>{event.actor?.displayName ?? "Unknown actor"}</strong> {details.summary}</p>
                    {details.detail && <p className="mt-1 text-[#52525B]">{details.detail}</p>}
                  </div>
                  <time dateTime={event.createdAt} className="text-xs text-[#52525B]">
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
