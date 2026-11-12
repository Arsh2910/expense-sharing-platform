import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { AuthLayout } from "@/features/auth/auth-layout";
import {
  authKeys,
  useVerifyEmailMutation,
} from "@/features/auth/auth.queries";
import {
  verifyEmailFormSchema,
  type VerifyEmailFormValues,
} from "@/features/auth/auth.schemas";
import { getErrorMessage } from "@/lib/api/errors";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const urlToken = searchParams.get("token")?.trim() ?? "";
  const hasAutoSubmittedRef = React.useRef(false);
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const verifyMutation = useVerifyEmailMutation();
  const [verified, setVerified] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerifyEmailFormValues>({
    resolver: zodResolver(verifyEmailFormSchema),
    defaultValues: {
      token: urlToken,
    },
  });

  const handleVerifySuccess = React.useCallback(() => {
    setVerified(true);
    void queryClient.invalidateQueries({ queryKey: authKeys.me });
  }, [queryClient]);

  React.useEffect(() => {
    if (urlToken.length >= 20 && !hasAutoSubmittedRef.current) {
      hasAutoSubmittedRef.current = true;
      verifyMutation
        .mutateAsync({ token: urlToken })
        .then(handleVerifySuccess)
        .catch(() => {
          // Displayed via verifyMutation.error
        });
    }
  }, [urlToken, verifyMutation, handleVerifySuccess]);

  const onSubmit = async (values: VerifyEmailFormValues) => {
    try {
      await verifyMutation.mutateAsync({ token: values.token.trim() });
      handleVerifySuccess();
    } catch {
      // Displayed via verifyMutation.error
    }
  };

  if (verified) {
    return (
      <AuthLayout
        title="Email verified"
        subtitle="Your email address has been confirmed."
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3.5 rounded-lg border border-teal-200 bg-teal-50/70 p-4 text-[#115E59]">
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0"
              aria-hidden="true"
            />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Verification complete</p>
              <p className="opacity-90">
                {isAuthenticated
                  ? "Your email update is now active on your account."
                  : "You can now sign in with your email and password."}
              </p>
            </div>
          </div>

          {isAuthenticated ? (
            <Button asChild className="w-full" size="lg">
              <Link to="/settings">Return to Account Settings</Link>
            </Button>
          ) : (
            <Button asChild className="w-full" size="lg">
              <Link to="/login" state={{ verifiedEmail: true }}>
                Continue to sign in
              </Link>
            </Button>
          )}
        </div>
      </AuthLayout>
    );
  }

  const serverError = verifyMutation.error
    ? getErrorMessage(verifyMutation.error)
    : null;

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="Confirm your email address using the verification token sent to your inbox."
      footer={
        isAuthenticated ? (
          <>
            Return to{" "}
            <Link
              to="/settings"
              className="font-medium text-[#0F766E] hover:text-[#0D5E57] underline underline-offset-4"
            >
              Account Settings
            </Link>
          </>
        ) : (
          <>
            Back to{" "}
            <Link
              to="/login"
              className="font-medium text-[#0F766E] hover:text-[#0D5E57] underline underline-offset-4"
            >
              Sign in
            </Link>
          </>
        )
      }
    >
      <div className="space-y-4">
        {verifyMutation.isPending && urlToken && (
          <div className="flex items-center gap-3 rounded-lg border border-[#E7E5E0] bg-[#FAF9F6] px-4 py-3 text-sm text-[#3F3F46]">
            <Loader2
              className="h-4 w-4 animate-spin text-[#0F766E]"
              aria-hidden="true"
            />
            <span>Verifying your email token...</span>
          </div>
        )}

        {serverError && <Alert variant="error">{serverError}</Alert>}

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <FormField
            id="verify-token"
            label="Verification token"
            hint="Paste the token from your verification email."
            error={errors.token?.message}
            required
          >
            <Input
              id="verify-token"
              type="text"
              placeholder="Paste verification token..."
              hasError={Boolean(errors.token)}
              {...register("token")}
            />
          </FormField>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={verifyMutation.isPending}
          >
            Verify email address
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
