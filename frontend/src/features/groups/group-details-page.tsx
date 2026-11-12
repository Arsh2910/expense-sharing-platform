import * as React from "react";
import {
  Activity,
  ArrowLeftRight,
  Receipt,
  RefreshCw,
  Scale,
  Settings2,
  UserPlus,
  Users,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
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
import { AddMemberDialog } from "@/features/groups/add-member-dialog";
import {
  useGroupMembersQuery,
  useMyGroupsQuery,
} from "@/features/groups/groups.queries";
import { RoleBadge } from "@/features/groups/role-badge";
import { getErrorMessage, isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils/cn";
import { formatDate, getCurrencyLabel } from "@/lib/utils/format";

type GroupTab = "members" | "expenses" | "balances" | "settlements" | "activity";

const TABS: ReadonlyArray<{
  id: GroupTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
}> = [
  { id: "members", label: "Members", icon: Users },
  { id: "expenses", label: "Expenses", icon: Receipt, comingSoon: true },
  { id: "balances", label: "Balances", icon: Scale, comingSoon: true },
  {
    id: "settlements",
    label: "Settlements",
    icon: ArrowLeftRight,
    comingSoon: true,
  },
  { id: "activity", label: "Activity", icon: Activity, comingSoon: true },
];

export function GroupDetailsPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = React.useState<GroupTab>("members");
  const [addMemberOpen, setAddMemberOpen] = React.useState(false);

  const groupsQuery = useMyGroupsQuery();
  const membersQuery = useGroupMembersQuery(groupId);

  const group = React.useMemo(
    () => groupsQuery.data?.find((item) => item.id === groupId),
    [groupsQuery.data, groupId],
  );

  const isLoadingInitial =
    groupsQuery.isLoading || (membersQuery.isLoading && !membersQuery.data);

  if (!groupId) {
    return (
      <EmptyState
        icon={Users}
        title="Group not specified"
        description="Select a group from your groups list."
        action={
          <Button asChild variant="outline">
            <Link to="/groups">Back to My Groups</Link>
          </Button>
        }
      />
    );
  }

  if (isLoadingInitial) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Handle forbidden / not found / invalid UUID errors cleanly
  if (membersQuery.isError) {
    const err = membersQuery.error;
    const isAccessOrMissing =
      isApiError(err) &&
      (err.status === 404 || err.status === 403 || err.status === 400);

    if (isAccessOrMissing) {
      return (
        <div className="space-y-6">
          <PageHeader
            title="Group unavailable"
            backTo={{ label: "Back to My Groups", href: "/groups" }}
          />
          <EmptyState
            icon={Users}
            title={
              err.status === 403
                ? "You do not have access to this group"
                : "Group not found"
            }
            description={getErrorMessage(err)}
            action={
              <Button asChild>
                <Link to="/groups">Return to My Groups</Link>
              </Button>
            }
          />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <PageHeader
          title={group?.name ?? "Group details"}
          backTo={{ label: "Back to My Groups", href: "/groups" }}
        />
        <Alert variant="error" title="Could not load group details">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{getErrorMessage(err)}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void membersQuery.refetch();
                void groupsQuery.refetch();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  // Handle case where groupsQuery succeeded without finding this group (e.g. archived/missing)
  if (!groupsQuery.isLoading && !groupsQuery.isError && !group) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Group not found"
          backTo={{ label: "Back to My Groups", href: "/groups" }}
        />
        <EmptyState
          icon={Users}
          title="This group could not be found"
          description="It may have been archived or you are no longer an active member."
          action={
            <Button asChild>
              <Link to="/groups">Return to My Groups</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const members = membersQuery.data ?? [];
  const currentMembership =
    group?.memberships[0] ??
    members.find((member) => member.user.id === user?.id);
  const currentRole = currentMembership?.role;
  const canAddMembers = currentRole === "OWNER" || currentRole === "ADMIN";

  return (
    <div className="space-y-6">
      <PageHeader
        title={group?.name ?? "Group"}
        description={
          group
            ? `${getCurrencyLabel(group.currency)} · Created ${formatDate(group.createdAt)}`
            : undefined
        }
        backTo={{ label: "Back to My Groups", href: "/groups" }}
        actions={
          canAddMembers ? (
            <Button onClick={() => setAddMemberOpen(true)}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add member
            </Button>
          ) : undefined
        }
      />

      {/* Metadata Summary Cards (only backed by real data) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-[#71717A]">Base currency</p>
            <p className="mt-1.5 text-lg font-semibold tracking-tight text-[#18181B] font-mono">
              {group?.currency ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-[#71717A]">Active members</p>
            <p className="mt-1.5 text-lg font-semibold tracking-tight text-[#18181B] tabular-nums">
              {members.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-[#71717A]">Your role</p>
            <div className="mt-2">
              {currentRole ? (
                <RoleBadge role={currentRole} />
              ) : (
                <span className="text-sm text-[#71717A]">—</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section Tabs */}
      <div className="border-b border-[#E7E5E0]">
        <nav
          aria-label="Group sections"
          className="-mb-px flex gap-1 overflow-x-auto"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-3 text-sm font-medium transition-colors cursor-pointer",
                  isActive
                    ? "border-[#0F766E] text-[#0F766E]"
                    : "border-transparent text-[#52525B] hover:border-[#D6D3CD] hover:text-[#18181B]",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{tab.label}</span>
                {tab.id === "members" && (
                  <span className="rounded-md bg-[#F4F3EF] px-1.5 py-0.5 text-[11px] font-medium text-[#52525B] tabular-nums">
                    {members.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active Tab Panel */}
      {activeTab === "members" && (
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Group members</CardTitle>
                <CardDescription>
                  Active participants who can view and collaborate within{" "}
                  {group?.name ?? "this group"}.
                </CardDescription>
              </div>
              {canAddMembers && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddMemberOpen(true)}
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add member
                </Button>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {members.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No active members"
                  description="No active members were returned for this group."
                />
              ) : (
                <ul className="divide-y divide-[#F4F3EF]">
                  {members.map((member) => {
                    const isCurrentUser = member.user.id === user?.id;
                    return (
                      <li
                        key={member.id}
                        className="flex flex-col gap-3 py-3.5 first:pt-1 last:pb-1 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar
                            name={member.user.displayName}
                            tone={isCurrentUser ? "accent" : "neutral"}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-[#18181B] truncate">
                                {member.user.displayName}
                              </p>
                              {isCurrentUser && (
                                <Badge variant="outline" className="text-[11px]">
                                  You
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-[#71717A] truncate">
                              {member.user.username
                                ? `@${member.user.username}`
                                : "No username set"}{" "}
                              · Joined {formatDate(member.joinedAt)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-center">
                          <RoleBadge role={member.role} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <ComingSoonPanel
            icon={Settings2}
            title="Role changes, member removal, and group settings"
            description="Promoting admins, transferring ownership, removing members, leaving a group, and renaming or archiving groups will appear here once those endpoints are available."
          />
        </div>
      )}

      {activeTab === "expenses" && (
        <ComingSoonPanel
          icon={Receipt}
          title="Shared expenses"
          description="Record group expenses in the group's base currency with support for single or multiple payers and equal, exact, or percentage splits."
          detail="This capability is planned in the Expense Engine API and will connect here without changing your existing group membership."
        />
      )}

      {activeTab === "balances" && (
        <ComingSoonPanel
          icon={Scale}
          title="Group balances"
          description="View each member's exact net position and simplified repayment breakdown computed from verified financial records."
          detail="Balances will be calculated on the server in integer minor units once expenses and settlements are enabled."
        />
      )}

      {activeTab === "settlements" && (
        <ComingSoonPanel
          icon={ArrowLeftRight}
          title="Settlements"
          description="Record manual payments between members and track settlement corrections with full reversal history."
          detail="Settlement recording and audit trails are planned for an upcoming backend release."
        />
      )}

      {activeTab === "activity" && (
        <ComingSoonPanel
          icon={Activity}
          title="Group activity feed"
          description="Review a chronological log of expenses, edits, settlements, and membership changes for this group."
          detail="Activity history will populate automatically once the activity feed endpoint is implemented."
        />
      )}

      {group && (
        <AddMemberDialog
          groupId={group.id}
          groupName={group.name}
          open={addMemberOpen}
          onOpenChange={setAddMemberOpen}
        />
      )}
    </div>
  );
}
