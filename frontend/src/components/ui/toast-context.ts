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

