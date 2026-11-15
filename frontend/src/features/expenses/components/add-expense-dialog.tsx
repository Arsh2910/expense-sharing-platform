import * as React from "react";
import { AlertCircle, Check, Pencil, Plus, RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
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
import { useToast } from "@/components/ui/toast-context";
import { useAuth } from "@/hooks/use-auth";
import type { GroupMember } from "@/types/api";
import { getErrorMessage, getValidationErrors, isApiError } from "@/lib/api/errors";
import {
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
} from "../expenses.queries";
import type {
  CreateExpensePayload,
  ExpenseItem,
  SplitType,
  UpdateExpensePayload,
} from "../expenses.types";
import {
  formatMinorToMajor,
  formatMoneyDisplay,
  formatPercentageUnits,
  parseMajorToMinor,
  parsePercentageUnits,
  PERCENTAGE_SCALE,
} from "../money";
import {
  computeEqualPreview,
  computePercentagePreview,
} from "../split-engine";
import { EqualSplitEditor } from "./equal-split-editor";
import {
  type ExactParticipantRow,
  ExactSplitEditor,
} from "./exact-split-editor";
import { ExpenseDetailsSection } from "./expense-details-section";
import { ExpenseReviewSummary } from "./expense-review-summary";
import { PayerEditor, type PayerRow } from "./payer-editor";
import {
  type PercentageParticipantRow,
  PercentageSplitEditor,
} from "./percentage-split-editor";
import { SplitMethodSelector } from "./split-method-selector";

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface AddExpenseDialogProps {
  groupId: string;
  currency: string;
  members: GroupMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExpenseCreated?: (expense: ExpenseItem) => void;
  initialExpense?: ExpenseItem | null;
  onExpenseUpdated?: (expense: ExpenseItem) => void;
  onReloadExpense?: () => void;
}

interface AddExpenseFormProps {
  groupId: string;
  currency: string;
  members: GroupMember[];
  onClose: () => void;
  onExpenseCreated?: (expense: ExpenseItem) => void;
  initialExpense?: ExpenseItem | null;
  onExpenseUpdated?: (expense: ExpenseItem) => void;
  onReloadExpense?: () => void;
}

function AddExpenseForm({
  groupId,
  currency,
  members,
  onClose,
  onExpenseCreated,
  initialExpense,
  onExpenseUpdated,
  onReloadExpense,
}: AddExpenseFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isEdit = Boolean(initialExpense);

  const createMutation = useCreateExpenseMutation(groupId);
  const updateMutation = useUpdateExpenseMutation(
    groupId,
    initialExpense?.id ?? "",
  );
  const isPending = isEdit ? updateMutation.isPending : createMutation.isPending;
  const activeError = isEdit ? updateMutation.error : createMutation.error;

  const todayIso = React.useMemo(() => getTodayIsoDate(), []);

  const defaultUser =
    members.find((m) => m.user.id === user?.id)?.user.id ??
    members[0]?.user.id ??
    "";

  // Form states initialized directly on mount
  const [description, setDescription] = React.useState(
    () => initialExpense?.description ?? "",
  );
  const [category, setCategory] = React.useState(
    () => initialExpense?.category ?? "",
  );
  const [expenseDate, setExpenseDate] = React.useState(
    () => initialExpense?.expenseDate ?? todayIso,
  );
  const [assertedTotal, setAssertedTotal] = React.useState("");

  const [payers, setPayers] = React.useState<PayerRow[]>(() => {
    if (initialExpense && initialExpense.payers.length > 0) {
      return initialExpense.payers.map((p) => ({
        userId: p.userId,
        amount: formatMinorToMajor(p.amountMinor, currency),
      }));
    }
    return [{ userId: defaultUser, amount: "" }];
  });

  const [splitType, setSplitType] = React.useState<SplitType>(
    () => initialExpense?.splitType ?? "EQUAL",
  );

  const [equalParticipants, setEqualParticipants] = React.useState<string[]>(
    () => {
      if (initialExpense && initialExpense.splitType === "EQUAL") {
        return initialExpense.splits.map((s) => s.userId);
      }
      return members.map((m) => m.user.id);
    },
  );

  const [exactParticipants, setExactParticipants] = React.useState<
    ExactParticipantRow[]
  >(() => {
    if (initialExpense && initialExpense.splitType === "EXACT") {
      return members.map((m) => {
        const found = initialExpense.splits.find((s) => s.userId === m.user.id);
        return {
          userId: m.user.id,
          amount: found ? formatMinorToMajor(found.amountMinor, currency) : "",
        };
      });
    }
    return members.map((m) => ({ userId: m.user.id, amount: "" }));
  });

  const [percentageParticipants, setPercentageParticipants] = React.useState<
    PercentageParticipantRow[]
  >(() => {
    if (initialExpense && initialExpense.splitType === "PERCENTAGE") {
      return members.map((m) => {
        const found = initialExpense.splits.find((s) => s.userId === m.user.id);
        return {
          userId: m.user.id,
          percentage:
            found?.percentUnits !== null && found?.percentUnits !== undefined
              ? formatPercentageUnits(BigInt(found.percentUnits))
              : "",
        };
      });
    }
    return members.map((m) => ({ userId: m.user.id, percentage: "" }));
  });

  const [conflictError, setConflictError] = React.useState<{
    message: string;
    currentVersion?: number;
  } | null>(null);

  const [confirmDiscardOpen, setConfirmDiscardOpen] = React.useState(false);

  // Payer total calculation in minor units
  let payerTotalMinor = 0n;
  const payerRowErrors: Record<number, string> = {};
  payers.forEach((p, idx) => {
    if (!p.amount.trim()) {
      return;
    }
    const minor = parseMajorToMinor(p.amount, currency);
    if (minor === null) {
      payerRowErrors[idx] = "Invalid decimal amount";
    } else if (minor <= 0n) {
      payerRowErrors[idx] = "Amount must be greater than zero";
    } else {
      payerTotalMinor += minor;
    }
  });

  // Calculate preview splits & reconciliation
  let isReconciled = false;
  let reconciliationMessage: string | undefined;
  let computedSplits = new Map<string, bigint>();

  const isFutureDate = expenseDate > todayIso;

  if (isFutureDate) {
    reconciliationMessage = "Expense date cannot be in the future.";
  } else if (!description.trim()) {
    reconciliationMessage = "Enter an expense description.";
  } else if (payers.length === 0 || payerTotalMinor <= 0n) {
    reconciliationMessage = "Add at least one payer with an amount > 0.";
  } else if (Object.keys(payerRowErrors).length > 0) {
    reconciliationMessage = "Fix invalid payer amount(s).";
  } else {
    // Check asserted total if provided
    if (assertedTotal.trim()) {
      const assertedMinor = parseMajorToMinor(assertedTotal, currency);
      if (assertedMinor === null) {
        reconciliationMessage = "Invalid target total format.";
      } else if (assertedMinor !== payerTotalMinor) {
        reconciliationMessage = `Target total (${formatMoneyDisplay(assertedMinor, currency)}) does not match payer sum (${formatMoneyDisplay(payerTotalMinor, currency)}).`;
      }
    }

    if (!reconciliationMessage) {
      if (splitType === "EQUAL") {
        if (equalParticipants.length === 0) {
          reconciliationMessage = "Select at least one participant.";
        } else {
          computedSplits = computeEqualPreview(
            payerTotalMinor,
            equalParticipants,
          );
          isReconciled = true;
          const participantCount = equalParticipants.length;
          reconciliationMessage = `Split equally across ${participantCount} participant${participantCount === 1 ? "" : "s"} (${formatMoneyDisplay(payerTotalMinor, currency)} total).`;
        }
      } else if (splitType === "EXACT") {
        let exactTotalMinor = 0n;
        const validExactRows: Array<{ userId: string; amount: bigint }> = [];

        exactParticipants.forEach((p) => {
          if (!p.amount.trim()) return;
          const minor = parseMajorToMinor(p.amount, currency);
          if (minor !== null && minor > 0n) {
            exactTotalMinor += minor;
            validExactRows.push({ userId: p.userId, amount: minor });
          }
        });

        if (validExactRows.length === 0) {
          reconciliationMessage = "Enter exact shares for participants.";
        } else if (exactTotalMinor !== payerTotalMinor) {
          const diff = payerTotalMinor - exactTotalMinor;
          reconciliationMessage =
            diff > 0n
              ? `Allocations are short by ${formatMoneyDisplay(diff, currency)}. Must equal ${formatMoneyDisplay(payerTotalMinor, currency)}.`
              : `Allocations exceed total by ${formatMoneyDisplay(-diff, currency)}. Must equal ${formatMoneyDisplay(payerTotalMinor, currency)}.`;
        } else {
          validExactRows.forEach((r) => computedSplits.set(r.userId, r.amount));
          isReconciled = true;
          reconciliationMessage = `Exact allocations perfectly match ${formatMoneyDisplay(payerTotalMinor, currency)}.`;
        }
      } else if (splitType === "PERCENTAGE") {
        let totalPercentUnits = 0n;
        const validPercentageRows: Array<{
          userId: string;
          percentUnits: bigint;
        }> = [];

        percentageParticipants.forEach((p) => {
          if (!p.percentage.trim()) return;
          const units = parsePercentageUnits(p.percentage);
          if (units !== null && units > 0n) {
            totalPercentUnits += units;
            validPercentageRows.push({ userId: p.userId, percentUnits: units });
          }
        });

        if (validPercentageRows.length === 0) {
          reconciliationMessage = "Assign percentage shares to participants.";
        } else if (totalPercentUnits !== PERCENTAGE_SCALE) {
          const diff = PERCENTAGE_SCALE - totalPercentUnits;
          reconciliationMessage =
            diff > 0n
              ? `Percentages are short by ${formatPercentageUnits(diff)}%. Must total 100.00%.`
              : `Percentages are over by ${formatPercentageUnits(-diff)}%. Must total 100.00%.`;
        } else {
          computedSplits = computePercentagePreview(
            payerTotalMinor,
            validPercentageRows,
          );
          isReconciled = true;
          reconciliationMessage = `Percentages total 100.00% (${formatMoneyDisplay(payerTotalMinor, currency)}).`;
        }
      }
    }
  }

  const isFormDirty = isEdit
    ? description.trim() !== (initialExpense?.description ?? "") ||
      category !== (initialExpense?.category ?? "") ||
      expenseDate !== (initialExpense?.expenseDate ?? todayIso) ||
      splitType !== initialExpense?.splitType
    : description.trim().length > 0 ||
      payers.some((p) => p.amount.trim().length > 0) ||
      category.length > 0;

  const handleRequestClose = () => {
    if (isFormDirty && !isPending) {
      setConfirmDiscardOpen(true);
    } else {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReconciled || isPending) return;

    let splitPayload: CreateExpensePayload["split"];

    if (splitType === "EQUAL") {
      splitPayload = {
        type: "EQUAL",
        participants: equalParticipants,
      };
    } else if (splitType === "EXACT") {
      splitPayload = {
        type: "EXACT",
        participants: exactParticipants
          .filter((p) => {
            const minor = parseMajorToMinor(p.amount, currency);
            return minor !== null && minor > 0n;
          })
          .map((p) => ({
            userId: p.userId,
            amount: p.amount.trim(),
          })),
      };
    } else {
      splitPayload = {
        type: "PERCENTAGE",
        participants: percentageParticipants
          .filter((p) => {
            const units = parsePercentageUnits(p.percentage);
            return units !== null && units > 0n;
          })
          .map((p) => ({
            userId: p.userId,
            percentage: p.percentage.trim(),
          })),
      };
    }

    const payload: CreateExpensePayload = {
      description: description.trim(),
      category: category.trim() || undefined,
      expenseDate,
      total: assertedTotal.trim() || undefined,
      payers: payers
        .filter((p) => {
          const minor = parseMajorToMinor(p.amount, currency);
          return minor !== null && minor > 0n;
        })
        .map((p) => ({
          userId: p.userId,
          amount: p.amount.trim(),
        })),
      split: splitPayload,
    };

    setConflictError(null);

    if (isEdit && initialExpense) {
      const updatePayload: UpdateExpensePayload = {
        ...payload,
        version: initialExpense.version,
      };

      try {
        const response = await updateMutation.mutateAsync(updatePayload);
        addToast({
          title: "Expense updated",
          description: `"${response.data.description}" (${formatMoneyDisplay(BigInt(response.data.totalMinor), currency)}) updated.`,
          variant: "success",
        });
        onClose();
        if (onExpenseUpdated) {
          onExpenseUpdated(response.data);
        }
      } catch (err) {
        if (isApiError(err) && err.status === 409) {
          if (err.code === "VERSION_CONFLICT") {
            const details = err.details as { currentVersion?: number } | undefined;
            setConflictError({
              message:
                err.message ||
                "Another group member updated this expense while you were editing. Reload the latest version before saving.",
              currentVersion: details?.currentVersion,
            });
            return;
          }
        }
      }
    } else {
      try {
        const response = await createMutation.mutateAsync(payload);
        addToast({
          title: "Expense recorded",
          description: `"${response.data.description}" (${formatMoneyDisplay(BigInt(response.data.totalMinor), currency)}) created.`,
          variant: "success",
        });
        onClose();
        if (onExpenseCreated) {
          onExpenseCreated(response.data);
        }
      } catch {
        // Handled via mutation state
      }
    }
  };

  const validationErrors = getValidationErrors(activeError);

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6 pt-1">
        {conflictError && (
          <Alert variant="error" className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-sm">Version conflict detected</p>
                <p className="text-xs leading-relaxed">{conflictError.message}</p>
                {conflictError.currentVersion !== undefined && (
                  <p className="text-xs font-mono">
                    Latest server version: v{conflictError.currentVersion} (editing v{initialExpense?.version})
                  </p>
                )}
              </div>
            </div>
            {onReloadExpense && (
              <div className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setConflictError(null);
                    onReloadExpense();
                  }}
                  className="gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reload latest version
                </Button>
              </div>
            )}
          </Alert>
        )}

        {Boolean(activeError) && !conflictError && (
          <Alert variant="error">
            {getErrorMessage(activeError)}
          </Alert>
        )}

        {/* Section 1: Details */}
        <ExpenseDetailsSection
          description={description}
          onDescriptionChange={setDescription}
          descriptionError={validationErrors.description}
          category={category}
          onCategoryChange={setCategory}
          expenseDate={expenseDate}
          onExpenseDateChange={setExpenseDate}
          dateError={
            isFutureDate
              ? "Expense date cannot be in the future"
              : validationErrors.expenseDate
          }
          currency={currency}
          assertedTotal={assertedTotal}
          onAssertedTotalChange={setAssertedTotal}
          assertedTotalError={validationErrors.total}
          disabled={isPending}
        />

        {/* Section 2: Who Paid */}
        <PayerEditor
          payers={payers}
          onChange={setPayers}
          members={members}
          currency={currency}
          payerTotalMinor={payerTotalMinor}
          errors={payerRowErrors}
          generalError={validationErrors.payers}
          disabled={isPending}
        />

        {/* Section 3: Split Method */}
        <SplitMethodSelector
          value={splitType}
          onChange={setSplitType}
          disabled={isPending}
        />

        {/* Split Editor Panes */}
        {splitType === "EQUAL" && (
          <EqualSplitEditor
            selectedUserIds={equalParticipants}
            onChange={setEqualParticipants}
            members={members}
            totalMinor={payerTotalMinor}
            currency={currency}
            error={validationErrors["split.participants"]}
            disabled={isPending}
          />
        )}

        {splitType === "EXACT" && (
          <ExactSplitEditor
            participants={exactParticipants}
            onChange={setExactParticipants}
            members={members}
            totalMinor={payerTotalMinor}
            currency={currency}
            generalError={validationErrors["split.participants"]}
            disabled={isPending}
          />
        )}

        {splitType === "PERCENTAGE" && (
          <PercentageSplitEditor
            participants={percentageParticipants}
            onChange={setPercentageParticipants}
            members={members}
            totalMinor={payerTotalMinor}
            currency={currency}
            generalError={validationErrors["split.participants"]}
            disabled={isPending}
          />
        )}

        {/* Section 4: Review Summary */}
        <ExpenseReviewSummary
          description={description}
          category={category}
          expenseDate={expenseDate}
          currency={currency}
          payers={payers}
          splitType={splitType}
          computedSplits={computedSplits}
          members={members}
          payerTotalMinor={payerTotalMinor}
          isReconciled={isReconciled}
          reconciliationMessage={reconciliationMessage}
        />

        <DialogFooter className="pt-2 border-t border-[#E7E5E0]">
          <Button
            type="button"
            variant="outline"
            onClick={handleRequestClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={isPending}
            disabled={!isReconciled || isPending}
          >
            <Check className="h-4 w-4 mr-1.5" />
            {isEdit ? "Save Changes" : "Submit Expense"}
          </Button>
        </DialogFooter>
      </form>

      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title={isEdit ? "Discard Expense Edits?" : "Discard Unsaved Expense?"}
        description={
          isEdit
            ? "You have unsaved changes to this expense. Discard them?"
            : "You have entered expense information. If you close now, your changes will not be saved."
        }
        confirmLabel="Discard"
        variant="destructive"
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          onClose();
        }}
      />
    </>
  );
}

export function AddExpenseDialog({
  groupId,
  currency,
  members,
  open,
  onOpenChange,
  onExpenseCreated,
  initialExpense,
  onExpenseUpdated,
  onReloadExpense,
}: AddExpenseDialogProps) {
  const isEdit = Boolean(initialExpense);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? (
              <Pencil className="h-5 w-5 text-[#0F766E]" />
            ) : (
              <Plus className="h-5 w-5 text-[#0F766E]" />
            )}
            {isEdit
              ? `Edit Expense (v${initialExpense?.version})`
              : "Add Group Expense"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update expense details, payers, and split allocations in ${currency}.`
              : `Record a shared expense in ${currency} and distribute the shares among group members.`}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <AddExpenseForm
            groupId={groupId}
            currency={currency}
            members={members}
            onClose={() => onOpenChange(false)}
            onExpenseCreated={onExpenseCreated}
            initialExpense={initialExpense}
            onExpenseUpdated={onExpenseUpdated}
            onReloadExpense={onReloadExpense}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
