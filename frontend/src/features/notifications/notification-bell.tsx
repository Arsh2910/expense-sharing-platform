import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { notificationKeys, notificationsApi } from "./notifications.api";

export function NotificationBell() {
  const { user } = useAuth();
  const unread = useQuery({
    queryKey: notificationKeys(user?.id ?? "").count,
    queryFn: notificationsApi.count,
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });
  const count = unread.data ?? 0;
  return (
    <Button asChild size="icon" variant="ghost" className="relative">
      <Link to="/notifications" aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}>
        <Bell className="h-5 w-5" aria-hidden="true" />
        {count > 0 && (
          <span aria-hidden="true" className="absolute right-0 top-0 rounded-full bg-[#0F766E] px-1 text-[10px] font-medium text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
