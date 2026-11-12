import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

export interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  id,
  label,
  error,
  hint,
  required = false,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-[#71717A]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

