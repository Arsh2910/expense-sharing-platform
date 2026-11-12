import * as React from "react";
import { AlertCircle, Archive, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-context";
import {
  useArchiveGroupMutation,
  useUpdateGroupMutation,
} from "@/features/groups/groups.queries";
import { updateGroupFormSchema } from "@/features/groups/groups.schemas";
import { getErrorMessage, getValidationErrors } from "@/lib/api/errors";
import type { GroupRole } from "@/types/api";

export interface EditGroupDialogProps {
  groupId: string;
  initialName: string;
  currency: string;
  myRole: GroupRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditGroupDialog({
  groupId,
  initialName,
  currency,
  myRole,
  open,
  onOpenChange,
}: EditGroupDialogProps) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [name, setName] = React.useState(initialName);
  const [prevInitialName, setPrevInitialName] = React.useState(initialName);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  if (initialName !== prevInitialName) {
    setName(initialName);
    setPrevInitialName(initialName);
    setValidationError(null);
  }

  const updateMutation = useUpdateGroupMutation(groupId);
  const archiveMutation = useArchiveGroupMutation(groupId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const parseResult = updateGroupFormSchema.safeParse({ name });
    if (!parseResult.success) {
      setValidationError(
        parseResult.error.issues[0]?.message ?? "Invalid group name",
      );
      return;
    }

    try {
      await updateMutation.mutateAsync({ name: parseResult.data.name });
      addToast({
        title: "Group updated",
        description: "Group name has been saved.",
        variant: "success",
      });
      onOpenChange(false);
    } catch {
      // Handled via mutation state
    }
  };

  const handleArchive = async () => {
    try {
      await archiveMutation.mutateAsync();
      setConfirmArchiveOpen(false);
      onOpenChange(false);
      addToast({
        title: "Group archived",
        description: "The group has been archived and removed from active listings.",
        variant: "info",
      });
      navigate("/groups");
    } catch {
      // Handled via mutation state
    }
  };

  const fieldErrors = getValidationErrors(updateMutation.error);
  const nameError = validationError ?? fieldErrors.name;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Group Settings</DialogTitle>
            <DialogDescription>
              Manage group details and administrative settings.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {updateMutation.isError && (
              <Alert variant="error">
                {getErrorMessage(updateMutation.error)}
              </Alert>
            )}

            <FormField
              id="group-name"
              label="Group Name"
              error={nameError}
              required
            >
              <Input
                id="group-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                disabled={updateMutation.isPending}
                placeholder="e.g. Summer Vacation, Apartment 4B"
              />
            </FormField>

            <div className="rounded-xl border border-[#E7E5E0] bg-[#FAF8F5] p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#71717A]">Base Currency</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {currency}
                </Badge>
              </div>
              <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                Base currency is permanently locked to preserve accounting integrity for past and future transactions.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={updateMutation.isPending}
                disabled={!name.trim() || name === initialName}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Save Changes
              </Button>
            </DialogFooter>
          </form>

          {myRole === "OWNER" && (
            <div className="mt-5 border-t border-[#E7E5E0] pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-[#B91C1C] flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Archive this group
                  </p>
                  <p className="text-[11px] text-[#71717A]">
                    Archiving locks the group and hides it from all members.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[#B91C1C] border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300 shrink-0"
                  onClick={() => setConfirmArchiveOpen(true)}
                >
                  <Archive className="h-3.5 w-3.5 mr-1.5" />
                  Archive
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmArchiveOpen}
        onOpenChange={setConfirmArchiveOpen}
        title={`Archive "${initialName}"?`}
        description="Are you sure you want to archive this group? It will be removed from all members' active group lists and cannot accept any more members or updates."
        confirmLabel="Archive Group"
        variant="destructive"
        isLoading={archiveMutation.isPending}
        onConfirm={handleArchive}
      />
    </>
  );
}
