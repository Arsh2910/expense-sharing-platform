import { MailCheck, ArrowRight, KeyRound } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/features/auth/auth-layout";

interface VerifyPendingState {
  email?: string;
  displayName?: string;
}

export function VerifyPendingPage() {
  const location = useLocation();
  const state = (location.state as VerifyPendingState | null) ?? null;

  return (
    <AuthLayout
      title="Verify your email address"
      subtitle="Email verification is required before signing in to your SplitCircle account."
      footer={
        <>
          Already verified?{" "}
          <Link
            to="/login"
            className="font-medium text-accent hover:text-accent-hover underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3.5 rounded-lg border border-border-subtle bg-surface-subtle p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 text-accent">
            <MailCheck className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium text-ink">
              {state?.email ? (
                <>
                  Check <span className="font-semibold">{state.email}</span> for a verification link
                </>
              ) : (
                "Check your inbox for a verification link"
              )}
            </p>
            <p className="text-ink-secondary leading-relaxed">
              Open the link or enter the token from the email. It expires in 24 hours.
            </p>
            <p className="text-ink-secondary leading-relaxed">
              If you don’t see the email, check your spam or junk folder.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button asChild className="flex-1">
            <Link to="/verify-email">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Enter verification token
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link to="/login">
              Go to sign in
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}

