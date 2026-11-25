import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AuthLayout } from "@/features/auth/auth-layout";
import { OAuthNotice, OAuthOptions } from "@/features/auth/oauth-options";
import { useLoginMutation } from "@/features/auth/auth.queries";
import {
  loginFormSchema,
  type LoginFormValues,
} from "@/features/auth/auth.schemas";
import { getErrorMessage } from "@/lib/api/errors";

interface LoginLocationState {
  from?: string;
  sessionExpired?: boolean;
  accountDeleted?: boolean;
  verifiedEmail?: boolean;
  passwordResetMessage?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const state = (location.state as LoginLocationState | null) ?? null;

  const [showPassword, setShowPassword] = React.useState(false);
  const loginMutation = useLoginMutation();

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await loginMutation.mutateAsync({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });
      toast({
        title: "Signed in",
        description: "Welcome back to SplitCircle.",
        variant: "success",
      });
      const target =
        state?.from && state.from.startsWith("/") ? state.from : "/";
      navigate(target, { replace: true });
    } catch {
      // Handled via loginMutation.error
    }
  };

  const serverError = loginMutation.error
    ? getErrorMessage(loginMutation.error)
    : null;
  const isUnverifiedError = serverError === "Email verification required";

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Pick up where you left off with your groups and shared expenses."
      footer={
        <>
          New to SplitCircle?{" "}
          <Link
            to="/register"
            state={{ from: state?.from }}
            className="font-medium text-accent hover:text-accent-hover underline underline-offset-4"
          >
            Create an account
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <OAuthNotice />
        {state?.sessionExpired && (
          <Alert variant="warning" title="Session expired">
            Your session ended or was signed out. Please sign in again to
            continue.
          </Alert>
        )}

        {state?.accountDeleted && (
          <Alert variant="info" title="Account deactivated">
            Your account has been deactivated and all active sessions were
            cleared.
          </Alert>
        )}

        {state?.passwordResetMessage && <Alert variant="success">{state.passwordResetMessage}</Alert>}

        {state?.verifiedEmail && (
          <Alert variant="success" title="Email verified">
            Your email address is verified. You can now sign in.
          </Alert>
        )}

        {serverError && (
          <Alert variant="error">
            <p>{serverError}</p>
            {isUnverifiedError && (
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium">
                <Link
                  to="/verify-pending"
                  state={{ email: getValues("email") }}
                  className="underline underline-offset-2 hover:opacity-80"
                >
                  Verification instructions
                </Link>
                <Link
                  to="/verify-email"
                  className="underline underline-offset-2 hover:opacity-80"
                >
                  Enter verification token
                </Link>
              </div>
            )}
          </Alert>
        )}

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <FormField
            id="login-email"
            label="Email address"
            error={errors.email?.message}
            required
          >
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              hasError={Boolean(errors.email)}
              {...register("email")}
            />
          </FormField>

          <FormField
            id="login-password"
            label="Password"
            error={errors.password?.message}
            required
          >
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                hasError={Boolean(errors.password)}
                className="pr-10"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-muted transition-colors hover:text-ink"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </FormField>

          <Link to="/forgot-password" className="inline-block text-sm text-accent underline">Forgot password?</Link>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={loginMutation.isPending}
          >
            Sign in
          </Button>
        </form>
        <OAuthOptions returnTo={state?.from} />
      </div>
    </AuthLayout>
  );
}
