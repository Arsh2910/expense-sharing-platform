import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/utils/format";
import { notificationKeys, notificationsApi, type NotificationItem } from "./notifications.api";

const notificationLabels = {
  INVITATION: "You were invited to",
  SETTLEMENT_RECORDED: "A settlement was recorded in",
  SETTLEMENT_REVERSED: "A settlement was reversed in",
  EXPENSE_CREATED: "An expense was added in",
  EXPENSE_UPDATED: "An expense was updated in",
  EXPENSE_DELETED: "An expense was deleted in",
};

function notificationDestination(item: NotificationItem) {
  if (item.type === "INVITATION") {
    return { path: `/invitations?invitationId=${encodeURIComponent(item.invitationId)}`, label: "View invitation" };
  }
  const groupPath = `/groups/${encodeURIComponent(item.groupId)}`;
  if ("expenseId" in item) {
    const expensePath = `${groupPath}?tab=expenses`;
    return item.expenseDeleted
      ? { path: expensePath, label: "View expenses" }
      : { path: `${expensePath}&expenseId=${encodeURIComponent(item.expenseId)}`, label: "View expense" };
  }
  return { path: `${groupPath}?tab=settlements`, label: "View settlements" };
}

export function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const keys = notificationKeys(user?.id ?? "");
  const inbox = useInfiniteQuery({
    queryKey: keys.inbox,
    queryFn: ({ pageParam }) => notificationsApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(user),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.all });
  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: () => { void refresh(); } });
  const markAllRead = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: refresh });
  const items = inbox.data?.pages.flatMap((page) => page.items) ?? [];
  const isUpdating = markRead.isPending || markAllRead.isPending;

  return (
    <div className="space-y-5">
      <PageHeader title="Notifications" actions={items.length > 0 && (
        <Button variant="outline" disabled={isUpdating} onClick={() => markAllRead.mutate()}>
          Mark all as read
        </Button>
      )} />
      {inbox.isPending && <p role="status">Loading notifications…</p>}
      {inbox.isError && <Alert variant="error">{getErrorMessage(inbox.error)}</Alert>}
      {(markRead.isError || markAllRead.isError) && (
        <Alert variant="error">{getErrorMessage(markRead.error ?? markAllRead.error)}</Alert>
      )}
      {inbox.isSuccess && items.length === 0 && <Alert>You have no notifications yet.</Alert>}
      {items.length > 0 && (
        <Card>
          <CardContent>
            <ul className="divide-y divide-[#E7E5E0]">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-1 last:pb-1">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words font-medium">{notificationLabels[item.type]} {item.groupName}</p>
                      {!item.readAt && <Badge variant="accent">Unread</Badge>}
                    </div>
                    {"expenseDescription" in item && item.expenseDescription && (
                      <p className="mt-1 break-words text-sm">{item.expenseDescription}</p>
                    )}
                    <p className="mt-1 text-sm text-[#52525B]">{formatDate(item.createdAt)}</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={isUpdating} onClick={async () => {
                    try {
                      if (!item.readAt) await markRead.mutateAsync(item.id);
                      navigate(notificationDestination(item).path);
                    } catch {
                      // The inbox displays the mutation error and keeps the notification open for retry.
                    }
                  }}>{notificationDestination(item).label}</Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {inbox.hasNextPage && (
        <Button variant="outline" isLoading={inbox.isFetchingNextPage}
          onClick={() => { void inbox.fetchNextPage(); }}>Load more</Button>
      )}
    </div>
  );
}
