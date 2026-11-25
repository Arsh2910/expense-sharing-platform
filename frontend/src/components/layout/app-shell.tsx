import * as React from "react";
import {
  Activity,
  ChevronDown,
  Code2,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Mail,
  Settings,
  Users,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { BrandMark } from "@/features/auth/auth-layout";
import { useLogoutMutation } from "@/features/auth/auth.queries";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils/cn";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Overview", to: "/", icon: LayoutDashboard, end: true },
  { label: "My Groups", to: "/groups", icon: Users },
  { label: "Invitations", to: "/invitations", icon: Mail },
  { label: "Activity", to: "/activity", icon: Activity },
  { label: "Account Settings", to: "/settings", icon: Settings },
  ...(import.meta.env.DEV
    ? [{ label: "API Testing (Dev)", to: "/dev/api-tests", icon: Code2 }]
    : []),
] as const;

function SidebarNav({ collapsed }: { collapsed: boolean }) {
  return (
    <nav
      aria-label="Main navigation"
      className="flex flex-1 flex-col gap-1 px-3 py-4"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            aria-label={item.label}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-panel text-accent"
                  : "text-ink-secondary hover:bg-panel hover:text-ink",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    "h-4.5 w-4.5 shrink-0 transition-colors",
                    isActive ? "text-accent" : "text-ink-muted",
                  )}
                  aria-hidden="true"
                />
                <span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

function MobileNav() {
  return (
    <nav aria-label="Primary destinations" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border-subtle bg-chrome px-2 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {NAV_ITEMS.slice(0, 4).map(({ label, to, end, icon: Icon }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => cn(
          "flex min-h-15 flex-col items-center justify-center gap-1 rounded-md px-1 text-center text-[11px] font-semibold focus-visible:-outline-offset-2",
          isActive ? "text-accent" : "text-ink-secondary hover:bg-surface-subtle",
        )}>
          <Icon className="size-5" aria-hidden="true" />
          {label === "My Groups" ? "Groups" : label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const logoutMutation = useLogoutMutation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = React.useState(false);
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    toast({
      title: "Signed out",
      description: "Your session has been closed on this device.",
      variant: "info",
    });
    navigate("/login", { replace: true });
  };

  const displayName = user?.displayName ?? "Account";
  const email = user?.email ?? "";

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:text-accent">Skip to content</a>
      <aside className={cn(
        "hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:flex-col lg:border-r lg:border-border-subtle lg:bg-chrome",
        collapsed ? "lg:w-18" : "lg:w-60",
      )}>
        <div className={cn("flex h-16 items-center gap-2.5 border-b border-border-subtle", collapsed ? "justify-center px-2" : "px-5")}>
          <BrandMark className="size-7 shrink-0" />
          {!collapsed && <span className="font-display text-lg font-extrabold tracking-tight">SplitCircle</span>}
        </div>
        <SidebarNav collapsed={collapsed} />
        <div className="flex justify-end border-t border-border-subtle p-3">
          <Button variant="ghost" size="icon" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>
            <CollapseIcon className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className={cn("flex min-w-0 flex-1 flex-col", collapsed ? "lg:pl-18" : "lg:pl-60")}>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border-subtle bg-chrome px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 lg:hidden">
              <BrandMark className="h-6 w-6" />
              <span className="text-sm font-semibold tracking-tight">
                SplitCircle
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-3">
            <ThemeToggle />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="inline-flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border-subtle hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus cursor-pointer"
                >
                  <Avatar name={displayName} size="sm" tone="accent" />
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-medium text-ink leading-none">
                      {displayName}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-muted leading-none">
                      {user?.username ? `@${user.username}` : email}
                    </p>
                  </div>
                  <ChevronDown
                    className="h-3.5 w-3.5 text-ink-muted"
                    aria-hidden="true"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium text-ink truncate">
                      {displayName}
                    </p>
                    <p className="text-xs text-ink-muted truncate">{email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate("/settings")}>
                  <Settings
                    className="h-4 w-4 text-ink-muted"
                    aria-hidden="true"
                  />
                  Account settings
                </DropdownMenuItem>
                {import.meta.env.DEV && (
                  <DropdownMenuItem onSelect={() => navigate("/dev/api-tests")}>API testing</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={handleLogout}
                  disabled={logoutMutation.isPending}
                  className="text-red-700 focus:bg-red-50 focus:text-red-800"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  {logoutMutation.isPending ? "Signing out..." : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pt-7 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:py-9">
          <Outlet />
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
