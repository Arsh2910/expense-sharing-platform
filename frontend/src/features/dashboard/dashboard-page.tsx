import * as React from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Clock,
  Plus,
  RefreshCw,
  Scale,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ComingSoonPanel, EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { CreateGroupDialog } from "@/features/groups/create-group-dialog";
import { useMyGroupsQuery } from "@/features/groups/groups.queries";
import { RoleBadge } from "@/features/groups/role-badge";
import { getErrorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/utils/format";

interface BalancePreviewCardProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  helperText: string;
}

function BalancePreviewCard({
  label,
  icon: Icon,
  helperText,
}: BalancePreviewCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-[#71717A]">{label}</p>
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E7E5E0] bg-[#FAF9F6] text-[#71717A]">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold tracking-tight text-[#A1A1AA] tabular-nums">
            —
          </span>
          <Badge variant="neutral" className="text-[11px]">
            <Clock className="h-3 w-3 text-[#71717A]" aria-hidden="true" />
            Coming soon
          </Badge>
        </div>
        <p className="mt-2 text-xs text-[#71717A] leading-relaxed">
          {helperText}
        </p>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = React.useState(false);
  const groupsQuery = useMyGroupsQuery();

  const groups = groupsQuery.data ?? [];
  const recentGroups = groups.slice(0, 5);
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || "there";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Review your shared expense groups and account readiness."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New group
          </Button>
        }
      />

      {/* Financial Summary Strip — Honest unimplemented placeholders */}
      <section aria-label="Balance summary">
        <div className="grid gap-4 sm:grid-cols-3">
          <BalancePreviewCard
            label="Total net balance"
            icon={Scale}
            helperText="Available once the Balances API is enabled."
          />
          <BalancePreviewCard
            label="Others owe you"
            icon={ArrowDownLeft}
            helperText="Receivables across groups will appear here."
          />
          <BalancePreviewCard
            label="You owe others"
            icon={ArrowUpRight}
            helperText="Outstanding shares across groups will appear here."
          />
        </div>
      </section>

      {/* Main Overview Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Groups Overview */}
        <section aria-label="Groups overview" className="lg:col-span-7">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Your groups</CardTitle>
                <CardDescription>
                  {groupsQuery.isLoading
                    ? "Loading your active groups..."
                    : `${groups.length} active ${groups.length === 1 ? "group" : "groups"}`}
                </CardDescription>
              </div>
              {groups.length > 0 && (
                <Button asChild variant="ghost" size="sm">
                  <Link to="/groups">
                    View all
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {groupsQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-[#F4F3EF] p-3.5"
                    >
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-5 w-12" />
                    </div>
                  ))}
                </div>
              ) : groupsQuery.isError ? (
                <Alert variant="error" title="Could not load groups">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{getErrorMessage(groupsQuery.error)}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void groupsQuery.refetch();
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Retry
                    </Button>
                  </div>
                </Alert>
              ) : groups.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Welcome to ClearLedger"
                  description="You haven't joined or created any groups yet. Create your first group to invite others and organize shared costs."
                  action={
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Create your first group
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-[#F4F3EF]">
                  {recentGroups.map((group) => {
                    const membership = group.memberships[0];
                    return (
                      <li key={group.id}>
                        <Link
                          to={`/groups/${group.id}`}
                          className="group flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-[#FAF9F6]"
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-medium text-[#18181B] group-hover:text-[#0F766E] transition-colors truncate">
                              {group.name}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[#71717A]">
                              {membership && (
                                <RoleBadge role={membership.role} />
                              )}
                              <span>Created {formatDate(group.createdAt)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <Badge variant="outline" className="font-mono text-[11px]">
                              {group.currency}
                            </Badge>
                            <ArrowRight
                              className="h-4 w-4 text-[#A1A1AA] transition-transform group-hover:translate-x-0.5 group-hover:text-[#0F766E]"
                              aria-hidden="true"
                            />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Recent Activity */}
        <section aria-label="Recent activity" className="lg:col-span-5">
          <ComingSoonPanel
            icon={Activity}
            title="Recent activity"
            description="A live chronological feed of new expenses, edits, and recorded settlements across your groups will appear here."
            detail="Activity tracking is scheduled after the Expense and Settlement APIs are released."
            className="h-full"
          />
        </section>
      </div>

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
