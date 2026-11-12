import { Link } from "react-router-dom";

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
    <div className="flex min-h-screen flex-col justify-between bg-[#FAF9F6] px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center">
        <div className="mb-8 flex flex-col items-start">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 text-[#18181B] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0F766E] rounded-lg"
          >
            <BrandMark className="h-8 w-8" />
            <span className="text-lg font-semibold tracking-tight">
              ClearLedger
            </span>
          </Link>
        </div>

        <div className="rounded-xl border border-[#E7E5E0] bg-white p-7 shadow-[0_1px_3px_rgba(24,24,27,0.05)] sm:p-8">
          <div className="mb-6 space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight text-[#18181B]">
              {title}
            </h1>
            <p className="text-sm text-[#52525B] leading-relaxed">{subtitle}</p>
          </div>
          {children}
        </div>

        {footer && (
          <div className="mt-6 text-center text-sm text-[#52525B]">{footer}</div>
        )}
      </div>

      <footer className="mx-auto mt-10 w-full max-w-[420px] text-center text-xs text-[#71717A]">
        ClearLedger — Transparent shared expense tracking
      </footer>
    </div>
  );
}

