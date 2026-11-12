import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import {
  ToastContext,
  type ToastVariant,
} from "@/components/ui/toast-context";
import { cn } from "@/lib/utils/cn";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

const VARIANT_ICON = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const VARIANT_STYLE = {
  success: "border-teal-200 bg-white text-[#18181B]",
  error: "border-red-200 bg-white text-[#18181B]",
  info: "border-[#E7E5E0] bg-white text-[#18181B]",
} as const;

const ICON_COLOR = {
  success: "text-[#0F766E]",
  error: "text-red-600",
  info: "text-[#52525B]",
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback(
    (options: {
      title: string;
      description?: string;
      variant?: ToastVariant;
    }) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [
        ...prev.slice(-3),
        {
          id,
          title: options.title,
          description: options.description,
          variant: options.variant ?? "info",
        },
      ]);
    },
    [],
  );

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={4500}>
        {children}
        {toasts.map((item) => {
          const Icon = VARIANT_ICON[item.variant];
          return (
            <ToastPrimitive.Root
              key={item.id}
              open={true}
              onOpenChange={(open) => {
                if (!open) removeToast(item.id);
              }}
              className={cn(
                "pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-4 shadow-md transition-all",
                VARIANT_STYLE[item.variant],
              )}
            >
              <Icon
                className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_COLOR[item.variant])}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <ToastPrimitive.Title className="text-sm font-medium text-[#18181B]">
                  {item.title}
                </ToastPrimitive.Title>
                {item.description && (
                  <ToastPrimitive.Description className="text-xs text-[#52525B] leading-relaxed">
                    {item.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close
                aria-label="Dismiss notification"
                className="rounded-md p-1 text-[#71717A] transition-colors hover:bg-[#F4F3EF] hover:text-[#18181B]"
              >
                <X className="h-3.5 w-3.5" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-[100] flex w-full max-w-sm flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
