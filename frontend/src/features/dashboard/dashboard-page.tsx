import * as React from "react";
import {
  Activity,
  ArrowRight,
  Mail,
  Plus,
  RefreshCw,
  Scale,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { invitationsApi, invitationsKeys } from "@/features/invitations/invitations.api";
import { getErrorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/utils/format";
import { CoachMark } from "@/features/onboarding/coach-mark";
import { useOnboarding } from "@/features/onboarding/onboarding-context";
import { BalanceOverview } from "./balance-overview";
import { RecentActivity } from "@/features/activity/recent-activity";

export function DashboardPage() {
  const { user } = useAuth();
  const onboarding = useOnboarding();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [expensePickerOpen, setExpensePickerOpen] = React.useState(false);
  const groupsQuery = useMyGroupsQuery();
  const invitationsQuery = useQuery({
    queryKey: invitationsKeys.inbox(user?.id ?? ""),
    queryFn: invitationsApi.listMine,
    enabled: Boolean(user),
  });
  const pendingInvitations = invitationsQuery.data?.filter((invitation) =>
    invitation.status === "PENDING",
  ).length ?? 0;

  const groups = groupsQuery.data ?? [];
  const showFirstStep = onboarding?.canStart && groupsQuery.isSuccess && groups.length === 0 &&
    invitationsQuery.isFetched && !createOpen;
  const recentGroups = groups.slice(0, 5);
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || "there";

  return (
    <div className="space-y-7">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        actions={
          <Button onClick={() => groups.length ? setExpensePickerOpen(true) : setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {groups.length ? "Add expense" : "New group"}
          </Button>
        }
      />
      {user && groups.length > 0 && <BalanceOverview groups={groups} userId={user.id} />}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-label="Groups overview" className="min-w-0">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Your groups</CardTitle>
                {groupsQuery.isLoading && <CardDescription>Loading your groups…</CardDescription>}
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
                      className="flex items-center justify-between rounded-lg border border-surface-subtle p-3.5"
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
                  title="Welcome to SplitCircle"
                  description={pendingInvitations > 0
                    ? "You have a group invitation waiting for you."
                    : "You haven't joined or created any groups yet. Create your first group to invite others and organize shared costs."}
                  action={
                    <CoachMark step={showFirstStep ? pendingInvitations > 0 ? {
                      number: 1,
                      title: "Join your group",
                      description: "Accept your invitation to open the group and see what’s being shared.",
                    } : {
                      number: 1,
                      title: "Start with a group",
                      description: "Give a trip, household, or other shared budget a place to track expenses.",
                    } : undefined}>
                      {(descriptionId) => pendingInvitations > 0 ? (
                        <Button asChild>
                          <Link to="/invitations" aria-describedby={descriptionId}>
                            <Mail className="size-4" aria-hidden="true" />
                            Review invitations
                          </Link>
                        </Button>
                      ) : (
                        <Button onClick={() => setCreateOpen(true)} aria-describedby={descriptionId}>
                          <Plus className="size-4" aria-hidden="true" />
                          Create your first group
                        </Button>
                      )}
                    </CoachMark>
                  }
                />
              ) : (
                <ul className="divide-y divide-surface-subtle">
                  {recentGroups.map((group) => {
                    const membership = group.memberships[0];
                    return (
                      <li key={group.id} className="flex flex-wrap items-center gap-x-2 py-1">
                        <Link
                          to={`/groups/${group.id}`}
                          className="group flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface-subtle"
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-medium text-ink group-hover:text-accent transition-colors truncate">
                              {group.name}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
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
                              className="hidden h-4 w-4 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent sm:block"
                              aria-hidden="true"
                            />
                          </div>
                        </Link>
                        <Button asChild size="sm" variant="ghost" className="shrink-0">
                          <Link to={`/groups/${group.id}?tab=balances`} aria-label={`View balances for ${group.name}`}>
                            <Scale className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="hidden sm:inline">Balances</span>
                          </Link>
                        </Button>
                        <Button asChild size="icon" variant="ghost" className="size-9">
                          <Link to={`/groups/${group.id}?tab=activity`} aria-label={`View activity for ${group.name}`} title="View group activity">
                            <Activity className="size-4" aria-hidden="true" />
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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {groupsQuery.isSuccess && (
            <section className="flex items-end justify-between gap-4 rounded-xl bg-panel p-6">
              <div>
                <h2 className="text-sm font-semibold text-ink">Active groups</h2>
                <p className="mt-2 text-5xl font-semibold leading-none tracking-tight tabular-nums text-ink">
                  {groups.length}
                </p>
              </div>
              <Users className="size-5 shrink-0 text-accent" aria-hidden="true" />
            </section>
          )}
          <section aria-label="Group shortcuts" className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
            <Link to="/invitations" className="group flex items-center gap-3 p-5 hover:bg-surface-subtle focus-visible:-outline-offset-2">
              <Mail className="size-4 shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {pendingInvitations > 0 ? "Review invitations" : "Invitations"}
                </span>
                {pendingInvitations > 0 && (
                  <span className="block text-sm text-ink-secondary">
                    {pendingInvitations} pending {pendingInvitations === 1 ? "invitation" : "invitations"}
                  </span>
                )}
              </span>
              <ArrowRight className="size-4 shrink-0 text-ink-muted group-hover:text-accent" aria-hidden="true" />
            </Link>
          </section>
        </div>
      </div>

      {user && groups.length > 0 && <RecentActivity groups={groups} userId={user.id} limit={4} />}
      <Dialog open={expensePickerOpen} onOpenChange={setExpensePickerOpen}>
        <DialogContent className="max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <DialogHeader>
            <DialogTitle>Choose a group</DialogTitle>
            <DialogDescription>The expense will use the group’s currency.</DialogDescription>
          </DialogHeader>
          <ul className="mt-4 divide-y divide-border-subtle">
            {groups.map((group) => (
              <li key={group.id}>
                <Link className="flex items-center justify-between gap-3 rounded-md px-2 py-3 text-sm hover:bg-surface-subtle"
                  to={`/groups/${group.id}?tab=expenses&newExpense=1`} onClick={() => setExpensePickerOpen(false)}>
                  <span className="min-w-0 break-words font-semibold">{group.name}</span>
                  <span className="shrink-0 text-ink-secondary">{group.currency}</span>
                </Link>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen}
        onGroupCreated={groupsQuery.isSuccess && groups.length === 0 ? onboarding?.enterGroup : undefined}
      />
    </div>
  );
}
