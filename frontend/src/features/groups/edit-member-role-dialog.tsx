import * as React from "react";
import { Check, Shield, ShieldAlert, UserCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-context";
import { useUpdateMemberRoleMutation } from "@/features/groups/groups.queries";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils/cn";
import type { GroupMember, GroupRole } from "@/types/api";

export interface EditMemberRoleDialogProps {
  groupId: string;
  member: GroupMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLES: ReadonlyArray<{
  role: GroupRole;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    role: "OWNER",
    title: "Owner",
    description:
      "Full control: can manage all members, appoint admins, promote owners, edit group settings, and archive the group.",
    icon: ShieldAlert,
  },
  {
    role: "ADMIN",
    title: "Admin",
    description:
      "Operational control: can invite/add new members, remove regular members, and update group settings.",
    icon: Shield,
  },
  {
    role: "MEMBER",
    title: "Member",
    description:
      "Standard access: can view group activity, add expenses, and settle balances.",
    icon: UserCheck,
  },
];

export function EditMemberRoleDialog({
  groupId,
  member,
  open,
  onOpenChange,
}: EditMemberRoleDialogProps) {
  const { addToast } = useToast();
  const [selectedRole, setSelectedRole] = React.useState<GroupRole>(
    member?.role ?? "MEMBER",
  );
  const [prevMemberId, setPrevMemberId] = React.useState(member?.id);

  if (member && member.id !== prevMemberId) {
    setSelectedRole(member.role);
    setPrevMemberId(member.id);
  }

  const updateRoleMutation = useUpdateMemberRoleMutation(groupId);

  if (!member) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await updateRoleMutation.mutateAsync({
        targetUserId: member.user.id,
        payload: { role: selectedRole },
      });
      addToast({
        title: "Role updated",
        description: `${member.user.displayName}'s role is now ${selectedRole}.`,
        variant: "success",
      });
      onOpenChange(false);
    } catch {
      // Handled via mutation state
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Member Role</DialogTitle>
          <DialogDescription>
            Update permissions for{" "}
            <span className="font-semibold text-[#18181B]">
              {member.user.displayName}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {updateRoleMutation.isError && (
            <Alert variant="error">
              {getErrorMessage(updateRoleMutation.error)}
            </Alert>
          )}

          <div className="space-y-2">
            {ROLES.map(({ role, title, description, icon: Icon }) => {
              const isSelected = selectedRole === role;
              return (
                <label
                  key={role}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors",
                    isSelected
                      ? "border-[#0F766E] bg-[#0F766E]/5 ring-1 ring-[#0F766E]"
                      : "border-[#E7E5E0] bg-white hover:bg-[#FAF8F5]",
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    checked={isSelected}
                    onChange={() => setSelectedRole(role)}
                    className="mt-1 h-4 w-4 text-[#0F766E] border-gray-300 focus:ring-[#0F766E]"
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-[#18181B] flex items-center gap-1.5">
                      <Icon className="h-4 w-4 text-[#0F766E]" />
                      {title}
                    </p>
                    <p className="text-xs text-[#71717A] leading-relaxed">
                      {description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateRoleMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={updateRoleMutation.isPending}
              disabled={selectedRole === member.role}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Save Role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
