import * as React from "react";
import {
  Activity,
  ChevronDown,
  Code2,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
                  ? "bg-[#F4F3EF] text-[#18181B]"
                  : "text-[#52525B] hover:bg-[#FAF9F6] hover:text-[#18181B]",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    "h-4.5 w-4.5 shrink-0 transition-colors",
                    isActive ? "text-[#0F766E]" : "text-[#71717A]",
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

  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

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
    <div className="flex min-h-screen bg-[#FAF9F6] text-[#18181B]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-[#E7E5E0] lg:bg-white">
        <div className="flex h-16 items-center gap-2.5 border-b border-[#E7E5E0] px-5">
          <BrandMark className="h-7 w-7" />
          <span className="text-base font-semibold tracking-tight text-[#18181B]">
            ClearLedger
          </span>
        </div>

        <SidebarNav />

        <div className="border-t border-[#E7E5E0] p-4">
          <div className="rounded-lg bg-[#FAF9F6] px-3.5 py-3 border border-[#E7E5E0]">
            <p className="text-xs font-medium text-[#18181B] truncate">
              {displayName}
            </p>
            <p className="mt-0.5 text-xs text-[#71717A] truncate">{email}</p>
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div
            className="fixed inset-0 bg-[#18181B]/35 backdrop-blur-[1px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-[#E7E5E0] bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-[#E7E5E0] px-5">
              <div className="flex items-center gap-2.5">
                <BrandMark className="h-7 w-7" />
                <span className="text-base font-semibold tracking-tight">
                  ClearLedger
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
            <div className="border-t border-[#E7E5E0] p-4">
              <Button
                variant="outline"
                className="w-full justify-start text-[#52525B]"
                onClick={handleLogout}
                isLoading={logoutMutation.isPending}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#E7E5E0] bg-white/95 px-4 backdrop-blur-xs sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 lg:hidden">
              <BrandMark className="h-6 w-6" />
              <span className="text-sm font-semibold tracking-tight">
                ClearLedger
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:border-[#E7E5E0] hover:bg-[#FAF9F6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E] cursor-pointer"
                >
                  <Avatar name={displayName} size="sm" tone="accent" />
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-medium text-[#18181B] leading-none">
                      {displayName}
                    </p>
                    <p className="mt-1 text-[11px] text-[#71717A] leading-none">
                      {user?.username ? `@${user.username}` : email}
                    </p>
                  </div>
                  <ChevronDown
                    className="h-3.5 w-3.5 text-[#71717A]"
                    aria-hidden="true"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium text-[#18181B] truncate">
                      {displayName}
                    </p>
                    <p className="text-xs text-[#71717A] truncate">{email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate("/settings")}>
                  <Settings
                    className="h-4 w-4 text-[#71717A]"
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

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
