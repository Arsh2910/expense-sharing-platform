import * as React from "react";
import { ArrowRight, Plus, RefreshCw, Search, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateGroupDialog } from "@/features/groups/create-group-dialog";
import { useGroupsBalances } from "@/features/balances/balances.queries";
import { formatMoneyDisplay } from "@/features/expenses/money";
import { useAuth } from "@/hooks/use-auth";
import { useMyGroupsQuery } from "@/features/groups/groups.queries";
import { RoleBadge } from "@/features/groups/role-badge";
import { getErrorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/utils/format";
import type { GroupSummary } from "@/types/api";

const EMPTY_GROUPS: GroupSummary[] = [];

export function GroupsListPage() {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const groupsQuery = useMyGroupsQuery();

  const groups = groupsQuery.data ?? EMPTY_GROUPS;
  const balances = useGroupsBalances(groups.map((group) => group.id));
  const balancesById = new Map(groups.map((group, index) => [group.id, balances[index]]));
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredGroups = React.useMemo(() => {
    if (!normalizedQuery) return groups;
    return groups.filter(
      (group) =>
        group.name.toLowerCase().includes(normalizedQuery) ||
        group.currency.toLowerCase().includes(normalizedQuery),
    );
  }, [groups, normalizedQuery]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Groups"
        description="Organize shared expenses across trips, households, and everyday groups."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New group
          </Button>
        }
      />

      {groupsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-5 w-12" />
                </div>
                <Skeleton className="h-4 w-24" />
                <div className="pt-2 flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : groupsQuery.isError ? (
        <Alert
          variant="error"
          title="Could not load your groups"
          className="items-center"
        >
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
          title="No groups yet"
          description="Create your first group to invite members and keep shared expenses organized under one base currency."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create your first group
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by name or currency..."
                aria-label="Filter groups"
                className="pl-9"
              />
            </div>
            <p className="text-xs text-ink-muted tabular-nums">
              Showing {filteredGroups.length} of {groups.length}{" "}
              {groups.length === 1 ? "group" : "groups"}
            </p>
          </div>

          {filteredGroups.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No matching groups"
              description={`No groups matched "${searchQuery.trim()}". Try clearing your filter or create a new group.`}
              action={
                <Button variant="outline" onClick={() => setSearchQuery("")}>
                  Clear filter
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface">
              {filteredGroups.map((group) => {
                const membership = group.memberships[0];
                const balance = balancesById.get(group.id);
                const personal = balance?.data?.members.find((member) => member.userId === user?.id);
                const activeMembers = balance?.data?.members.filter((member) => member.isActiveMember).length;
                const label = personal?.direction === "OWES" ? "You owe" : "You’re owed";
                return (
                  <li key={group.id}>
                  <Link
                    to={`/groups/${group.id}`}
                    className="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_minmax(0,7rem)_auto] items-center gap-2 rounded-lg px-3 py-4 hover:bg-surface-subtle focus-visible:-outline-offset-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,12rem)_auto] sm:gap-4 sm:px-5"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-panel text-sm font-extrabold text-accent" aria-hidden="true">{Array.from(group.name.trim())[0]?.toLocaleUpperCase()}</span>
                    <div className="min-w-0">
                      <h2 className="break-words text-sm font-extrabold group-hover:text-accent sm:text-base">{group.name}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
                        {membership && <RoleBadge role={membership.role} />}
                        <span>{group.currency}</span>
                        {activeMembers !== undefined && <span>{activeMembers} {activeMembers === 1 ? "member" : "members"}</span>}
                        <span className="hidden sm:inline">Created {formatDate(group.createdAt)}</span>
                      </div>
                    </div>
                    <div className="min-w-0 text-right text-xs text-ink-secondary">
                      {balance?.isPending ? "Loading balance…" : balance?.isError ? "Balance unavailable"
                        : personal?.direction === "SQUARE" ? "You’re settled"
                        : personal ? <>{label}<strong className="block text-sm text-ink tabular-nums [overflow-wrap:anywhere]">{formatMoneyDisplay(Math.abs(personal.balanceMinor), group.currency)}</strong></>
                        : "No balance yet"}
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
                  </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
