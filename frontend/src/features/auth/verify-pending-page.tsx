import { MailCheck, ArrowRight, KeyRound } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
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
      subtitle="Email verification is required before signing in to your ClearLedger account."
      footer={
        <>
          Already verified?{" "}
          <Link
            to="/login"
            className="font-medium text-[#0F766E] hover:text-[#0D5E57] underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3.5 rounded-lg border border-[#E7E5E0] bg-[#FAF9F6] p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 text-[#0F766E]">
            <MailCheck className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium text-[#18181B]">
              {state?.email ? (
                <>
                  Verification sent to{" "}
                  <span className="font-semibold">{state.email}</span>
                </>
              ) : (
                "Check your inbox for a verification link"
              )}
            </p>
            <p className="text-[#52525B] leading-relaxed">
              Open the verification link from your email, or paste the
              verification token directly on the verification page. Tokens
              remain valid for 24 hours.
            </p>
          </div>
        </div>

        <Alert variant="info">
          Re-sending verification emails is not yet available through the API.
          If your link expires, please contact support or check your inbox
          folders.
        </Alert>

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

