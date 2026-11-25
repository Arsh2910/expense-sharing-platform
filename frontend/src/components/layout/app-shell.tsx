import * as React from "react";
import * as NavigationDialog from "@radix-ui/react-dialog";
import {
  Activity,
  ChevronDown,
  Code2,
  LayoutDashboard,
  LogOut,
  Menu,
  Mail,
  Settings,
  Users,
  X,
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

function SidebarNav({ onItemClick }: { onItemClick?: () => void }) {
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
            onClick={onItemClick}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
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
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const logoutMutation = useLogoutMutation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const mobileMenuTrigger = React.useRef<HTMLButtonElement>(null);

  const handleLogout = async () => {
    setMobileMenuOpen(false);
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
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-border-subtle lg:bg-chrome">
        <div className="flex h-16 items-center gap-2.5 border-b border-border-subtle px-5">
          <BrandMark className="h-7 w-7" />
          <span className="text-base font-semibold tracking-tight text-ink">
            SplitCircle
          </span>
        </div>

        <SidebarNav />

        <div className="border-t border-border-subtle p-4">
          <div className="rounded-lg bg-surface-subtle px-3.5 py-3 border border-border-subtle">
            <p className="text-xs font-medium text-ink truncate">
              {displayName}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted truncate">{email}</p>
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      <NavigationDialog.Root open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <NavigationDialog.Portal>
          <NavigationDialog.Overlay className="fixed inset-0 z-40 bg-scrim/55" />
          <NavigationDialog.Content
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              mobileMenuTrigger.current?.focus();
            }}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto overscroll-contain border-r border-border-subtle bg-surface shadow-xl"
          >
            <NavigationDialog.Title className="sr-only">Mobile navigation</NavigationDialog.Title>
            <div className="flex h-16 items-center justify-between border-b border-border-subtle px-5">
              <div className="flex items-center gap-2.5">
                <BrandMark className="h-7 w-7" />
                <span className="text-base font-semibold tracking-tight">
                  SplitCircle
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-4.5 w-4.5" />
              </Button>
            </div>
            <SidebarNav onItemClick={() => setMobileMenuOpen(false)} />
            <div className="border-t border-border-subtle p-4">
              <Button
                variant="outline"
                className="w-full justify-start text-ink-secondary"
                onClick={handleLogout}
                isLoading={logoutMutation.isPending}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </Button>
            </div>
          </NavigationDialog.Content>
        </NavigationDialog.Portal>
      </NavigationDialog.Root>

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border-subtle bg-chrome px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              ref={mobileMenuTrigger}
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
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

        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
