import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { EXPENSE_CATEGORIES } from "../expenses.types";

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ExpenseDetailsSectionProps {
  description: string;
  onDescriptionChange: (value: string) => void;
  descriptionError?: string;

  category: string;
  onCategoryChange: (value: string) => void;

  expenseDate: string;
  onExpenseDateChange: (value: string) => void;
  dateError?: string;

  currency: string;

  assertedTotal: string;
  onAssertedTotalChange: (value: string) => void;
  assertedTotalError?: string;

  disabled?: boolean;
}

export function ExpenseDetailsSection({
  description,
  onDescriptionChange,
  descriptionError,
  category,
  onCategoryChange,
  expenseDate,
  onExpenseDateChange,
  dateError,
  currency,
  assertedTotal,
  onAssertedTotalChange,
  assertedTotalError,
  disabled = false,
}: ExpenseDetailsSectionProps) {
  const maxDate = React.useMemo(() => getTodayIsoDate(), []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-1 border-b border-border-subtle">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          1. Expense Details
        </h4>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-ink-muted">Group Currency:</span>
          <Badge variant="outline" className="font-mono font-bold">
            {currency}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormField
            id="expense-description"
            label="Description"
            error={descriptionError}
            required
          >
            <Input
              id="expense-description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="e.g. Dinner…"
              disabled={disabled}
              maxLength={500}
            />
          </FormField>
        </div>

        <div>
          <FormField id="expense-category" label="Category (Optional)">
            <select
              id="expense-category"
              value={category}
              onChange={(e) => onCategoryChange(e.target.value)}
              disabled={disabled}
              className="h-10 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-ink shadow-xs outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Select a category…</option>
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div>
          <FormField
            id="expense-date"
            label="Expense Date"
            error={dateError}
            required
          >
            <Input
              id="expense-date"
              type="date"
              value={expenseDate}
              onChange={(e) => onExpenseDateChange(e.target.value)}
              max={maxDate}
              disabled={disabled}
            />
          </FormField>
        </div>

        <div className="sm:col-span-2">
          <FormField
            id="expense-optional-total"
            label="Optional Target Total"
            hint="If provided, the sum of payer amounts must match this exact value."
            error={assertedTotalError}
          >
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-ink-muted">
                {currency}
              </span>
              <Input
                id="expense-optional-total"
                value={assertedTotal}
                onChange={(e) => onAssertedTotalChange(e.target.value)}
                placeholder="Optional amount…"
                className="pl-12 font-mono"
                disabled={disabled}
              />
            </div>
          </FormField>
        </div>
      </div>
    </div>
  );
}
