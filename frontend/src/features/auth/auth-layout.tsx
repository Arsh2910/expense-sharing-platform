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
    <main className="grid min-h-dvh grid-rows-[auto_1fr] bg-canvas text-ink">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
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
        </header>

        <div className="mx-auto grid w-full max-w-md content-start gap-7 px-5 pt-9 pb-12 sm:px-8 md:max-w-4xl md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] md:content-center md:gap-10 md:py-16 lg:gap-16">
          <div className="min-w-0 space-y-3 md:pt-1">
            <h1 className="text-balance text-[1.75rem] leading-tight font-extrabold tracking-[-0.035em] md:text-4xl">
              {title}
            </h1>
            <p className="max-w-[34ch] text-pretty text-sm leading-relaxed text-ink-secondary md:text-base">{subtitle}</p>
          </div>
          <div className="min-w-0 border-t border-border-subtle pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-10 lg:pl-16">
            {children}
            {footer && (
              <div className="mt-6 border-t border-border-subtle pt-4 text-sm text-ink-secondary">{footer}</div>
            )}
          </div>
        </div>
    </main>
  );
}

