import * as React from "react";
import { ArrowRight, Plus, RefreshCw, Search, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateGroupDialog } from "@/features/groups/create-group-dialog";
import { useMyGroupsQuery } from "@/features/groups/groups.queries";
import { RoleBadge } from "@/features/groups/role-badge";
import { getErrorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/utils/format";
import type { GroupSummary } from "@/types/api";

const EMPTY_GROUPS: GroupSummary[] = [];

export function GroupsListPage() {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const groupsQuery = useMyGroupsQuery();

  const groups = groupsQuery.data ?? EMPTY_GROUPS;
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#71717A]"
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
            <p className="text-xs text-[#71717A] tabular-nums">
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredGroups.map((group) => {
                const membership = group.memberships[0];
                return (
                  <Link
                    key={group.id}
                    to={`/groups/${group.id}`}
                    className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]"
                  >
                    <Card className="h-full transition-all duration-150 group-hover:border-[#B8B4AC] group-hover:shadow-sm">
                      <CardContent className="flex h-full flex-col justify-between p-5">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <h2 className="text-base font-semibold tracking-tight text-[#18181B] group-hover:text-[#0F766E] transition-colors line-clamp-2">
                              {group.name}
                            </h2>
                            <Badge variant="outline" className="shrink-0 font-mono text-[11px]">
                              {group.currency}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {membership && <RoleBadge role={membership.role} />}
                            <span className="text-xs text-[#71717A]">
                              Created {formatDate(group.createdAt)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-5 flex items-center justify-between border-t border-[#F4F3EF] pt-3.5 text-xs font-medium text-[#52525B] group-hover:text-[#0F766E]">
                          <span>Open group</span>
                          <ArrowRight
                            className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
                            aria-hidden="true"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
