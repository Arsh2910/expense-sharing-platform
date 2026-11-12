import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useAddGroupMemberMutation } from "@/features/groups/groups.queries";
import {
  addGroupMemberFormSchema,
  type AddGroupMemberFormValues,
} from "@/features/groups/groups.schemas";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api/errors";

export interface AddMemberDialogProps {
  groupId: string;
  groupName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMemberDialog({
  groupId,
  groupName,
  open,
  onOpenChange,
}: AddMemberDialogProps) {
  const { toast } = useToast();
  const addMemberMutation = useAddGroupMemberMutation(groupId);
  const { reset: resetMutation } = addMemberMutation;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddGroupMemberFormValues>({
    resolver: zodResolver(addGroupMemberFormSchema),
    defaultValues: {
      email: "",
    },
  });

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        reset({ email: "" });
        resetMutation();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, reset, resetMutation],
  );

  const onSubmit = async (values: AddGroupMemberFormValues) => {
    try {
      const response = await addMemberMutation.mutateAsync({
        email: values.email.trim().toLowerCase(),
      });
      toast({
        title: "Member added",
        description: `${response.data.user.displayName} joined ${groupName}.`,
        variant: "success",
      });
      handleOpenChange(false);
    } catch {
      // Displayed via addMemberMutation.error
    }
  };

  const serverError = addMemberMutation.error
    ? getErrorMessage(addMemberMutation.error)
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add group member</DialogTitle>
          <DialogDescription>
            Add an existing active user to{" "}
            <span className="font-medium text-[#18181B]">{groupName}</span> by
            entering their registered email address.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="mt-4 space-y-4"
        >
          {serverError && <Alert variant="error">{serverError}</Alert>}

          <FormField
            id="add-member-email"
            label="User email address"
            hint="The person must already have an active ClearLedger account."
            error={errors.email?.message}
            required
          >
            <Input
              id="add-member-email"
              type="email"
              placeholder="teammate@example.com"
              hasError={Boolean(errors.email)}
              autoFocus
              {...register("email")}
            />
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={addMemberMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={addMemberMutation.isPending}>
              Add member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
