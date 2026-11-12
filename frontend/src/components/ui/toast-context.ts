import * as React from "react";

export type ToastVariant = "success" | "error" | "info";

export interface ToastContextValue {
  toast: (options: {
    title: string;
    description?: string;
    variant?: ToastVariant;
  }) => void;
}

export const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return {
    ...context,
    addToast: context.toast,
  };
}
