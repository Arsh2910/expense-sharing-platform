import * as React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  LogOut,
  MoreVertical,
  Plus,
  Receipt,
  RefreshCw,
  Scale,
  Settings2,
  Shield,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-context";
import { useAuth } from "@/hooks/use-auth";
import { GroupActivity } from "@/features/activity/group-activity";
import { BalancesView } from "@/features/balances/components/balances-view";
import { AddExpenseDialog } from "@/features/expenses/components/add-expense-dialog";
import { ExpenseDetailsDialog } from "@/features/expenses/components/expense-details-dialog";
import { ExpenseList } from "@/features/expenses/components/expense-list";
import type { ExpenseItem } from "@/features/expenses/expenses.types";
import { RecordSettlementDialog } from "@/features/settlements/components/record-settlement-dialog";
import { SettlementsView } from "@/features/settlements/components/settlements-view";
import { EditGroupDialog } from "@/features/groups/edit-group-dialog";
import { EditMemberRoleDialog } from "@/features/groups/edit-member-role-dialog";
import {
  useGroupDetailsQuery,
  useGroupMembersQuery,
  useRemoveGroupMemberMutation,
} from "@/features/groups/groups.queries";
import { GroupInvitations } from "@/features/invitations/group-invitations";
import { RoleBadge } from "@/features/groups/role-badge";
import { getErrorMessage, isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils/cn";
import { formatDate, getCurrencyLabel } from "@/lib/utils/format";
import type { GroupMember } from "@/types/api";

type GroupTab = "invitations" | "members" | "expenses" | "balances" | "settlements" | "activity";

const TABS: ReadonlyArray<{
  id: GroupTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "members", label: "Members", icon: Users },
  { id: "invitations", label: "Invitations", icon: UserPlus },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "balances", label: "Balances", icon: Scale },
  { id: "settlements", label: "Settlements", icon: ArrowLeftRight },
  { id: "activity", label: "Activity", icon: Activity },
];

export function GroupDetailsPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [searchParams, setSearchParams] = useSearchParams();
  const linkedExpenseId = searchParams.get("tab") === "expenses" ? searchParams.get("expenseId") : null;
  const requestedTab = TABS.find((tab) => tab.id === searchParams.get("tab"))?.id ?? "members";
  function setActiveTab(tab: GroupTab) {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete("expenseId");
      if (tab === "members") next.delete("tab");
      else next.set("tab", tab);
      return next;
    }, { replace: true });
  }
  const [addExpenseOpen, setAddExpenseOpen] = React.useState(false);
  const [selectedExpenseForDetails, setSelectedExpenseForDetails] =
    React.useState<ExpenseItem | null>(null);
  const [selectedExpenseForEdit, setSelectedExpenseForEdit] =
    React.useState<ExpenseItem | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = React.useState(false);
  const [recordSettlementOpen, setRecordSettlementOpen] = React.useState(false);
  const [settlementTargetUserId, setSettlementTargetUserId] = React.useState<
    string | undefined
  >(undefined);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = React.useState(false);
  const [selectedMemberForRole, setSelectedMemberForRole] =
    React.useState<GroupMember | null>(null);

  const [removeDialogOpen, setRemoveDialogOpen] = React.useState(false);
  const [memberToRemove, setMemberToRemove] =
    React.useState<GroupMember | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = React.useState(false);

  // Directly fetch group details and member list via the new backend endpoints
  const groupDetailsQuery = useGroupDetailsQuery(groupId);
  const membersQuery = useGroupMembersQuery(groupId);
  const removeMutation = useRemoveGroupMemberMutation(groupId ?? "");

  const group = groupDetailsQuery.data;
  const members = membersQuery.data ?? [];
  const isArchived = Boolean(group?.archivedAt);

  const isLoadingInitial =
    (groupDetailsQuery.isLoading && !groupDetailsQuery.data) ||
    (membersQuery.isLoading && !membersQuery.data);

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

  // Handle errors cleanly (Forbidden, Not Found, Invalid UUID)
  if (groupDetailsQuery.isError || membersQuery.isError) {
    const err = groupDetailsQuery.error ?? membersQuery.error;
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
                void groupDetailsQuery.refetch();
                void membersQuery.refetch();
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

  const myRole = group?.myRole;
  const isOwner = myRole === "OWNER";
  const isAdmin = myRole === "ADMIN";
  const canManageSettings = isOwner || isAdmin;
  const canManageInvitations = isOwner || isAdmin;
  const activeTab = requestedTab === "invitations" && !canManageInvitations ? "members" : requestedTab;

  const handleOpenRoleDialog = (member: GroupMember) => {
    setSelectedMemberForRole(member);
    setRoleDialogOpen(true);
  };

  const handleOpenRemoveDialog = (member: GroupMember) => {
    setMemberToRemove(member);
    setRemoveDialogOpen(true);
  };

  const handleConfirmRemoveMember = async () => {
    if (!memberToRemove) return;

    try {
      await removeMutation.mutateAsync(memberToRemove.user.id);
      addToast({
        title: "Member removed",
        description: `${memberToRemove.user.displayName} was removed from the group.`,
        variant: "info",
      });
      setRemoveDialogOpen(false);
      setMemberToRemove(null);
    } catch (error) {
      addToast({
        title: "Could not remove member",
        description: getErrorMessage(error),
        variant: "error",
      });
    }
  };

  const handleConfirmLeaveGroup = async () => {
    if (!user) return;

    try {
      const res = await removeMutation.mutateAsync(user.id);
      setLeaveDialogOpen(false);

      if (res.data?.groupArchived) {
        addToast({
          title: "Left group and group archived",
          description:
            "You were the sole member. The group has been automatically archived.",
          variant: "info",
        });
      } else if (res.data?.successorUserId) {
        addToast({
          title: "Left group",
          description:
            "You left the group. Ownership has been transferred to the next active member.",
          variant: "info",
        });
      } else {
        addToast({
          title: "Left group",
          description: "You have left the group.",
          variant: "info",
        });
      }

      navigate("/groups");
    } catch (error) {
      addToast({
        title: "Could not leave group",
        description: getErrorMessage(error),
        variant: "error",
      });
    }
  };

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
          <div className="flex flex-wrap items-center gap-2">
            {!isArchived && (
              <Button
                size="sm"
                onClick={() => {
                  setSelectedExpenseForEdit(null);
                  setAddExpenseOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Add expense
              </Button>
            )}

            {canManageSettings && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Settings
              </Button>
            )}

            {canManageInvitations && !isArchived && activeTab !== "invitations" && (
              <Button size="sm" onClick={() => setActiveTab("invitations")}>
                <UserPlus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Invite member
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="text-[#71717A] hover:text-[#B91C1C] hover:border-red-200"
              onClick={() => setLeaveDialogOpen(true)}
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Leave
            </Button>
          </div>
        }
      />

      {/* Metadata Summary Cards */}
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
              {group?.memberCount ?? members.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-[#71717A]">Your role</p>
            <div className="mt-2">
              {myRole ? (
                <RoleBadge role={myRole} />
              ) : (
                <span className="text-sm text-[#71717A]">—</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Archived Banner */}
      {isArchived && (
        <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/80 text-xs text-amber-900 flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <p>
            <strong>This group is archived.</strong> You can view existing expenses, audit histories, and balances, but creating new expenses, editing, and deleting are disabled.
          </p>
        </div>
      )}

      {/* Section Tabs */}
      <div className="border-b border-[#E7E5E0]">
        <nav
          aria-label="Group sections"
          className="-mb-px flex gap-1 overflow-x-auto"
        >
          {TABS.filter((tab) => tab.id !== "invitations" || canManageInvitations).map((tab) => {
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

      {/* Active Tab: Members */}
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
              {canManageInvitations && !isArchived && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("invitations")}
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  Invite member
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

                    // Can the current viewer remove this member?
                    // OWNER can remove ADMIN or MEMBER, or another OWNER if another owner remains
                    // ADMIN can remove MEMBER
                    const canRemoveThisMember =
                      !isCurrentUser &&
                      (isOwner || (isAdmin && member.role === "MEMBER"));

                    // Can the current viewer change this member's role?
                    // Only OWNER can update roles
                    const canChangeThisMemberRole = isOwner && !isCurrentUser;

                    const hasRowActions =
                      canChangeThisMemberRole || canRemoveThisMember;

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

                        <div className="flex items-center gap-2.5 self-start sm:self-center">
                          <RoleBadge role={member.role} />

                          {hasRowActions && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-[#71717A] hover:text-[#18181B]"
                                  aria-label="Member actions"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>
                                  {member.user.displayName}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />

                                {canChangeThisMemberRole && (
                                  <DropdownMenuItem
                                    onClick={() => handleOpenRoleDialog(member)}
                                  >
                                    <ShieldCheck className="h-4 w-4 mr-2 text-[#0F766E]" />
                                    Change Role
                                  </DropdownMenuItem>
                                )}

                                {canRemoveThisMember && (
                                  <DropdownMenuItem
                                    onClick={() => handleOpenRemoveDialog(member)}
                                    className="text-red-600 focus:text-red-700 focus:bg-red-50"
                                  >
                                    <UserMinus className="h-4 w-4 mr-2" />
                                    Remove from Group
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Role Capabilities Reference */}
          <Card className="border-[#E7E5E0] bg-[#FAF8F5]/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-[#18181B]">
                <Shield className="h-4 w-4 text-[#0F766E]" />
                Role & Permissions Overview
              </CardTitle>
              <CardDescription className="text-xs">
                {isOwner
                  ? "As an Owner, you have full control over group settings, member roles, member removals, and archival."
                  : isAdmin
                    ? "As an Admin, you can invite new members, remove regular members, and update group settings."
                    : "As a Member, you can view group expenses, record payments, and manage your participation."}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}

      {activeTab === "invitations" && canManageInvitations && group && (
        <GroupInvitations groupId={group.id} archived={isArchived} />
      )}

      {activeTab === "expenses" && group && (
        <ExpenseList
          groupId={group.id}
          currency={group.currency}
          members={members}
          isArchived={isArchived}
          onAddExpense={() => {
            setSelectedExpenseForEdit(null);
            setAddExpenseOpen(true);
          }}
          onSelectExpense={(exp) => {
            setSelectedExpenseForDetails(exp);
            setDetailsDialogOpen(true);
          }}
        />
      )}

      {activeTab === "balances" && group && (
        <BalancesView
          groupId={group.id}
          members={members}
          isArchived={isArchived}
          onRecordSettlement={(targetUserId) => {
            setSettlementTargetUserId(targetUserId);
            setRecordSettlementOpen(true);
          }}
        />
      )}

      {activeTab === "settlements" && group && (
        <SettlementsView
          groupId={group.id}
          currency={group.currency}
          members={members}
          isArchived={isArchived}
          onRecordSettlement={() => {
            setSettlementTargetUserId(undefined);
            setRecordSettlementOpen(true);
          }}
        />
      )}

      {activeTab === "activity" && group && <GroupActivity groupId={group.id} />}

      {/* Dialogs */}
      {group && (
        <>
          <RecordSettlementDialog
            groupId={group.id}
            currency={group.currency}
            members={members}
            open={recordSettlementOpen}
            onOpenChange={(isOpen) => {
              setRecordSettlementOpen(isOpen);
              if (!isOpen) {
                setSettlementTargetUserId(undefined);
              }
            }}
            defaultRecipientId={settlementTargetUserId}
          />
          <AddExpenseDialog
            groupId={group.id}
            currency={group.currency}
            members={members}
            open={addExpenseOpen}
            onOpenChange={(isOpen) => {
              setAddExpenseOpen(isOpen);
              if (!isOpen) {
                setSelectedExpenseForEdit(null);
              }
            }}
            initialExpense={selectedExpenseForEdit}
            onExpenseCreated={(newExpense) => {
              setSelectedExpenseForDetails(newExpense);
              setActiveTab("expenses");
            }}
            onExpenseUpdated={(updatedExpense) => {
              setSelectedExpenseForDetails(updatedExpense);
            }}
          />

          <ExpenseDetailsDialog
            groupId={group.id}
            currency={group.currency}
            expenseId={linkedExpenseId ?? selectedExpenseForDetails?.id ?? null}
            members={members}
            open={detailsDialogOpen || Boolean(linkedExpenseId)}
            onOpenChange={(open) => {
              setDetailsDialogOpen(open);
              if (!open && linkedExpenseId) {
                const next = new URLSearchParams(searchParams);
                next.delete("expenseId");
                setSearchParams(next, { replace: true });
              }
            }}
            isArchived={isArchived}
            onEditExpense={(exp) => {
              setSelectedExpenseForEdit(exp);
              setAddExpenseOpen(true);
            }}
          />

          <EditGroupDialog
            groupId={group.id}
            initialName={group.name}
            currency={group.currency}
            myRole={group.myRole}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
          />

          <EditMemberRoleDialog
            groupId={group.id}
            member={selectedMemberForRole}
            open={roleDialogOpen}
            onOpenChange={setRoleDialogOpen}
          />

          {/* Remove Member Confirmation */}
          <ConfirmDialog
            open={removeDialogOpen}
            onOpenChange={setRemoveDialogOpen}
            title={`Remove ${memberToRemove?.user.displayName ?? "member"}?`}
            description="They will lose access to this group and will no longer be able to view group expenses or members."
            confirmLabel="Remove Member"
            variant="destructive"
            isLoading={removeMutation.isPending}
            onConfirm={handleConfirmRemoveMember}
          />

          {/* Leave Group Confirmation */}
          <ConfirmDialog
            open={leaveDialogOpen}
            onOpenChange={setLeaveDialogOpen}
            title={`Leave "${group.name}"?`}
            description={
              isOwner
                ? "You are currently an Owner of this group. If you leave, ownership will be automatically transferred to the next active member. If no other members remain, the group will be archived."
                : "Are you sure you want to leave this group? You will no longer have access to its expenses or members."
            }
            confirmLabel="Leave Group"
            variant="destructive"
            isLoading={removeMutation.isPending}
            onConfirm={handleConfirmLeaveGroup}
          />
        </>
      )}
    </div>
  );
}
