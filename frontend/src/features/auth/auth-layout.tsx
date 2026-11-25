import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="#0F766E" />
      <path
        d="M9.5 11.5H22.5M9.5 16H18.5M9.5 20.5H15.5"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="21" cy="20.5" r="2.2" fill="#99F6E4" />
    </svg>
  );
}

export interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <main className="flex min-h-dvh flex-col justify-center border-t-4 border-action bg-panel px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus rounded-lg"
          >
            <BrandMark className="h-8 w-8" />
            <span className="text-lg font-semibold tracking-tight">
              SplitCircle
            </span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface p-5 shadow-[0_16px_45px_#18382a12] sm:p-8">
          <div className="mb-6 space-y-1.5">
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-ink">
              {title}
            </h1>
            <p className="text-sm text-ink-secondary leading-relaxed">{subtitle}</p>
          </div>
          {children}
        </div>

        {footer && (
          <div className="mt-6 text-center text-sm text-ink-secondary">{footer}</div>
        )}
      </div>

    </main>
  );
}

