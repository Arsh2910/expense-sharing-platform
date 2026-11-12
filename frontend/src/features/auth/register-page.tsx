import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { AuthLayout } from "@/features/auth/auth-layout";
import { useRegisterMutation } from "@/features/auth/auth.queries";
import {
  registerFormSchema,
  type RegisterFormValues,
} from "@/features/auth/auth.schemas";
import { getErrorMessage } from "@/lib/api/errors";

export function RegisterPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = React.useState(false);
  const registerMutation = useRegisterMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    try {
      const response = await registerMutation.mutateAsync({
        displayName: values.displayName.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });

      navigate("/verify-pending", {
        replace: true,
        state: {
          email: response.data.email,
          displayName: response.data.displayName,
        },
      });
    } catch {
      // Handled via registerMutation.error
    }
  };

  const serverError = registerMutation.error
    ? getErrorMessage(registerMutation.error)
    : null;

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up your ClearLedger profile to organize groups and shared expenses."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-[#0F766E] hover:text-[#0D5E57] underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {serverError && <Alert variant="error">{serverError}</Alert>}

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <FormField
            id="register-display-name"
            label="Full name"
            error={errors.displayName?.message}
            required
          >
            <Input
              id="register-display-name"
              type="text"
              autoComplete="name"
              placeholder="Alex Rivera"
              hasError={Boolean(errors.displayName)}
              {...register("displayName")}
            />
          </FormField>

          <FormField
            id="register-email"
            label="Email address"
            error={errors.email?.message}
            required
          >
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              placeholder="alex@example.com"
              hasError={Boolean(errors.email)}
              {...register("email")}
            />
          </FormField>

          <FormField
            id="register-password"
            label="Password"
            hint="Use 8 to 72 characters."
            error={errors.password?.message}
            required
          >
            <div className="relative">
              <Input
                id="register-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Create a strong password"
                hasError={Boolean(errors.password)}
                className="pr-10"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-[#71717A] transition-colors hover:text-[#18181B]"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </FormField>

          <FormField
            id="register-confirm-password"
            label="Confirm password"
            error={errors.confirmPassword?.message}
            required
          >
            <Input
              id="register-confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              hasError={Boolean(errors.confirmPassword)}
              {...register("confirmPassword")}
            />
          </FormField>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={registerMutation.isPending}
          >
            Create account
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}

