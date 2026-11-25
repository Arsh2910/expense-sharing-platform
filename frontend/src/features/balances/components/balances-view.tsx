import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Info,
  Scale,
  Send,
  User,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import type { GroupMember } from "@/types/api";
import { RoleBadge } from "@/features/groups/role-badge";
import { formatMoneyDisplay } from "@/features/expenses/money";
import { useGroupBalancesQuery } from "../balances.queries";
import type { GroupBalanceMember } from "../balances.types";

export interface BalancesViewProps {
  groupId: string;
  members: GroupMember[];
  isArchived?: boolean;
  onRecordSettlement?: (targetUserId?: string) => void;
}

export function BalancesView({
  groupId,
  isArchived = false,
  onRecordSettlement,
}: BalancesViewProps) {
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch } = useGroupBalancesQuery(groupId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-red-200 bg-red-50/50 p-6 text-center">
        <CardContent className="space-y-3 pt-0">
          <p className="text-sm text-red-700">
            {error instanceof Error
              ? error.message
              : "Failed to load balances for this group."}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { currency, members: balanceMembers } = data;

  // Current user's balance
  const currentUserBalance = balanceMembers.find((m) => m.userId === user?.id);

  // Split into active and former members
  const activeMembers = balanceMembers.filter((m) => m.isActiveMember);
  const formerMembers = balanceMembers.filter((m) => !m.isActiveMember);

  return (
    <div className="space-y-6">
      {/* 1. Current user net position highlight card */}
      {currentUserBalance ? (
        <Card
          className={`overflow-hidden border border-l-4 ${
            currentUserBalance.direction === "RECEIVES"
              ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
              : currentUserBalance.direction === "OWES"
                ? "bg-amber-50/70 border-amber-200 text-amber-950"
                : "bg-surface-subtle border-border-subtle text-ink"
          }`}
        >
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 opacity-80">
                <Scale className="h-4 w-4" aria-hidden="true" />
                Your Net Position
              </span>
              <Badge
                className={`text-xs ${
                  currentUserBalance.direction === "RECEIVES"
                    ? "bg-emerald-200 text-emerald-900 border-emerald-300"
                    : currentUserBalance.direction === "OWES"
                      ? "bg-amber-200 text-amber-900 border-amber-300"
                      : "bg-border-subtle text-ink-secondary border-border-strong"
                }`}
              >
                {currentUserBalance.direction === "RECEIVES" && "You are owed"}
                {currentUserBalance.direction === "OWES" && "You owe"}
                {currentUserBalance.direction === "SQUARE" && "Settled up"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <div className="flex items-baseline gap-2">
              <div className="flex items-center gap-1">
                {currentUserBalance.direction === "RECEIVES" && (
                  <ArrowDownLeft className="h-6 w-6 text-emerald-600 shrink-0" />
                )}
                {currentUserBalance.direction === "OWES" && (
                  <ArrowUpRight className="h-6 w-6 text-amber-600 shrink-0" />
                )}
                {currentUserBalance.direction === "SQUARE" && (
                  <CheckCircle2 className="h-6 w-6 text-accent shrink-0" />
                )}
                <span className="text-3xl font-extrabold tabular-nums tracking-tight">
                  {currentUserBalance.direction === "RECEIVES" && "+"}
                  {currentUserBalance.direction === "OWES" && "-"}
                  {formatMoneyDisplay(
                    currentUserBalance.balanceMinor < 0
                      ? -currentUserBalance.balanceMinor
                      : currentUserBalance.balanceMinor,
                    currency,
                  )}
                </span>
              </div>
            </div>

            <p className="text-xs opacity-75">
              {currentUserBalance.direction === "RECEIVES" &&
                "Group members owe you this net amount across all active expenses."}
              {currentUserBalance.direction === "OWES" &&
                "You owe this net amount to the group across all active expenses."}
              {currentUserBalance.direction === "SQUARE" &&
                "You have no outstanding balance. You are completely settled up."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border-subtle bg-surface-subtle p-4 text-xs text-ink-muted">
          <p>You have not participated in expenses yet in this group.</p>
        </Card>
      )}

      {/* 2. Sign Convention Explanation */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl border border-border-subtle bg-surface-subtle/60 text-xs text-ink-secondary">
        <Info className="h-4 w-4 shrink-0 text-accent mt-0.5" />
        <p className="leading-relaxed">
          <strong>Sign Convention:</strong> Positive balances (+) represent money the group owes to that member. Negative balances (−) represent money that member owes to the group. A balance of zero means settled up.
        </p>
      </div>

      {/* 3. Active Members Balances Table */}
      <Card className="border-border-subtle">
        <CardHeader className="pb-3 border-b border-surface-subtle">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-ink">
                <Users className="h-4 w-4 text-accent" />
                Group Member Balances
              </CardTitle>
              <CardDescription className="text-xs">
                Authoritative server-computed net balances for all {activeMembers.length} active member(s).
              </CardDescription>
            </div>
            {onRecordSettlement && !isArchived && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRecordSettlement()}
                className="gap-1.5 text-xs self-start sm:self-center"
              >
                <Send className="h-3.5 w-3.5" />
                Record settlement
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 p-0">
          <ul className="divide-y divide-surface-subtle">
            {activeMembers.map((member: GroupBalanceMember) => {
              const isCurrentUser = member.userId === user?.id;

              return (
                <li
                  key={member.userId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-surface-subtle/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      name={member.displayName}
                      tone={isCurrentUser ? "accent" : "neutral"}
                    />
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink truncate">
                          {member.displayName}
                        </span>
                        {isCurrentUser && (
                          <Badge variant="outline" className="text-[10px]">
                            You
                          </Badge>
                        )}
                        {member.role && <RoleBadge role={member.role} />}
                      </div>
                      <p className="text-xs text-ink-muted truncate">
                        {member.username ? `@${member.username}` : "Member"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <div className="text-right">
                      <p
                        className={`text-sm font-bold tabular-nums ${
                          member.direction === "RECEIVES"
                            ? "text-emerald-700"
                            : member.direction === "OWES"
                              ? "text-amber-800"
                              : "text-ink-secondary"
                        }`}
                      >
                        {member.direction === "RECEIVES" && "+"}
                        {member.direction === "OWES" && "-"}
                        {formatMoneyDisplay(
                          member.balanceMinor < 0
                            ? -member.balanceMinor
                            : member.balanceMinor,
                          currency,
                        )}
                      </p>
                      <p className="text-[11px] font-medium text-ink-muted">
                        {member.direction === "RECEIVES" && "is owed"}
                        {member.direction === "OWES" && "owes"}
                        {member.direction === "SQUARE" && "settled"}
                      </p>
                    </div>

                    {!isCurrentUser && onRecordSettlement && !isArchived && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRecordSettlement(member.userId)}
                        className="h-8 px-2.5 text-xs text-accent hover:text-accent-hover hover:bg-teal-50 hover:border-teal-300"
                      >
                        Settle
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* 4. Former Members Historical Balances (if any) */}
      {formerMembers.length > 0 && (
        <Card className="border-border-subtle bg-surface-subtle/50">
          <CardHeader className="pb-3 border-b border-border-subtle">
            <CardTitle className="text-xs font-semibold text-ink-secondary uppercase tracking-wider flex items-center gap-2">
              <User className="h-4 w-4 text-ink-muted" />
              Former Members (Historical Balances)
            </CardTitle>
            <CardDescription className="text-xs">
              These members have departed from the group, but their historical balance records remain preserved.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 p-0">
            <ul className="divide-y divide-border-subtle">
              {formerMembers.map((member: GroupBalanceMember) => (
                <li
                  key={member.userId}
                  className="flex items-center justify-between p-3.5 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={member.displayName} size="sm" tone="neutral" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink-secondary truncate">
                          {member.displayName}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-border-subtle/60 text-ink-secondary"
                        >
                          Former Member
                        </Badge>
                      </div>
                      <p className="text-[11px] text-ink-muted truncate">
                        {member.username ? `@${member.username}` : "Left group"}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-semibold tabular-nums ${
                        member.direction === "RECEIVES"
                          ? "text-emerald-700"
                          : member.direction === "OWES"
                            ? "text-amber-800"
                            : "text-ink-muted"
                      }`}
                    >
                      {member.direction === "RECEIVES" && "+"}
                      {member.direction === "OWES" && "-"}
                      {formatMoneyDisplay(
                        member.balanceMinor < 0
                          ? -member.balanceMinor
                          : member.balanceMinor,
                        currency,
                      )}
                    </span>
                    <p className="text-[10px] text-ink-muted">
                      {member.direction === "RECEIVES" && "is owed"}
                      {member.direction === "OWES" && "owes"}
                      {member.direction === "SQUARE" && "settled"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
