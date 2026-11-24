import * as React from "react";
import {
  Activity,
  ArrowRight,
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
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { CreateGroupDialog } from "@/features/groups/create-group-dialog";
import { useMyGroupsQuery } from "@/features/groups/groups.queries";
import { RoleBadge } from "@/features/groups/role-badge";
import { getErrorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/utils/format";

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
        description="Open your groups, check balances, and review activity."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New group
          </Button>
        }
      />

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
                      <li key={group.id} className="flex flex-wrap items-center gap-x-2 py-1">
                        <Link
                          to={`/groups/${group.id}`}
                          className="group flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-[#FAF9F6]"
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
                        <Button asChild size="sm" variant="ghost" className="shrink-0">
                          <Link to={`/groups/${group.id}?tab=balances`} aria-label={`View balances for ${group.name}`}>
                            <Scale className="h-3.5 w-3.5" aria-hidden="true" />
                            Balances
                          </Link>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {recentGroups.length > 0 && (
          <section aria-label="Group activity" className="lg:col-span-5">
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle>Group activity</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/activity">View all groups</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-[#F4F3EF]">
                  {recentGroups.map((group) => (
                    <li key={group.id}>
                      <Link
                        to={`/groups/${group.id}?tab=activity`}
                        aria-label={`View activity for ${group.name}`}
                        className="group flex items-center gap-3 rounded-lg px-2 py-3 text-sm font-medium transition-colors hover:bg-[#FAF9F6] hover:text-[#0F766E]"
                      >
                        <Activity className="h-4 w-4 shrink-0 text-[#0F766E]" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{group.name}</span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-[#A1A1AA] group-hover:text-[#0F766E]" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        )}
      </div>

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
