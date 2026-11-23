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
import { notificationKeys, notificationsApi } from "./notifications.api";

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
                      <p className="break-words font-medium">You were invited to {item.groupName}</p>
                      {!item.readAt && <Badge variant="accent">Unread</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-[#52525B]">{formatDate(item.createdAt)}</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={isUpdating} onClick={async () => {
                    try {
                      if (!item.readAt) await markRead.mutateAsync(item.id);
                      navigate(`/invitations?invitationId=${encodeURIComponent(item.invitationId)}`);
                    } catch {
                      // The inbox displays the mutation error and keeps the notification open for retry.
                    }
                  }}>View invitation</Button>
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
