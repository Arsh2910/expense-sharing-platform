import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router-dom";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateGroupMutation } from "@/features/groups/groups.queries";
import {
  createGroupFormSchema,
  type CreateGroupFormValues,
} from "@/features/groups/groups.schemas";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api/errors";
import { COMMON_CURRENCIES } from "@/lib/utils/format";

export interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navigateOnCreate?: boolean;
}

const CUSTOM_CURRENCY_SENTINEL = "__CUSTOM__";

export function CreateGroupDialog({
  open,
  onOpenChange,
  navigateOnCreate = true,
}: CreateGroupDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createMutation = useCreateGroupMutation();
  const { reset: resetMutation } = createMutation;
  const [useCustomCurrency, setUseCustomCurrency] = React.useState(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CreateGroupFormValues>({
    resolver: zodResolver(createGroupFormSchema),
    defaultValues: {
      name: "",
      currency: "USD",
    },
  });

  const currentCurrency = useWatch({ control, name: "currency" });

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        reset({ name: "", currency: "USD" });
        setUseCustomCurrency(false);
        resetMutation();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, reset, resetMutation],
  );

  const handleSelectChange = (value: string) => {
    if (value === CUSTOM_CURRENCY_SENTINEL) {
      setUseCustomCurrency(true);
      setValue("currency", "", { shouldValidate: false });
      return;
    }
    setUseCustomCurrency(false);
    setValue("currency", value, { shouldValidate: true });
  };

  const onSubmit = async (values: CreateGroupFormValues) => {
    try {
      const response = await createMutation.mutateAsync({
        name: values.name.trim(),
        currency: values.currency.trim().toUpperCase(),
      });

      toast({
        title: "Group created",
        description: `"${response.data.name}" (${response.data.currency}) is ready.`,
        variant: "success",
      });

      handleOpenChange(false);
      if (navigateOnCreate) {
        navigate(`/groups/${response.data.id}`);
      }
    } catch {
      // Displayed via createMutation.error
    }
  };

  const serverError = createMutation.error
    ? getErrorMessage(createMutation.error)
    : null;

  const selectedSelectValue = useCustomCurrency
    ? CUSTOM_CURRENCY_SENTINEL
    : COMMON_CURRENCIES.some((c) => c.code === currentCurrency)
      ? currentCurrency
      : CUSTOM_CURRENCY_SENTINEL;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a shared group</DialogTitle>
          <DialogDescription>
            Choose a group name and base currency. Every expense and balance in
            this group will be tracked in this currency.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="mt-4 space-y-4"
        >
          {serverError && <Alert variant="error">{serverError}</Alert>}

          <FormField
            id="create-group-name"
            label="Group name"
            error={errors.name?.message}
            required
          >
            <Input
              id="create-group-name"
              placeholder="e.g., Lisbon Trip, Apartment 4B, Household"
              hasError={Boolean(errors.name)}
              autoFocus
              {...register("name")}
            />
          </FormField>

          <FormField
            id="create-group-currency"
            label="Base currency"
            hint="Cannot be changed once expenses are added."
            error={errors.currency?.message}
            required
          >
            <div className="space-y-2.5">
              <Select
                value={selectedSelectValue}
                onValueChange={handleSelectChange}
              >
                <SelectTrigger
                  id="create-group-currency"
                  hasError={Boolean(errors.currency)}
                >
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      <span className="font-medium">{currency.code}</span>
                      <span className="text-[#71717A]">
                        {" "}
                        — {currency.name}
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_CURRENCY_SENTINEL}>
                    Other ISO currency code...
                  </SelectItem>
                </SelectContent>
              </Select>

              {useCustomCurrency && (
                <Input
                  aria-label="Custom 3-letter currency code"
                  placeholder="3-letter ISO code (e.g., BRL, MXN, NZD)"
                  maxLength={3}
                  className="uppercase"
                  hasError={Boolean(errors.currency)}
                  {...register("currency", {
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                      e.target.value = e.target.value.toUpperCase();
                    },
                  })}
                />
              )}
            </div>
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={createMutation.isPending}>
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
