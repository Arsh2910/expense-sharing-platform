import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/api/errors";
import { AuthLayout } from "./auth-layout";
import { authKeys } from "./auth.queries";

function submitPasswordRequest(path: string, body: Record<string, string>) {
  return apiRequest<{ message: string }>(path, { method: "POST", body, skipRefresh: true });
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await submitPasswordRequest("/api/auth/forgot-password", { email });
      setMessage(result.message);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout title="Forgot your password?" subtitle="Request a link to choose a new password."
      footer={<Link to="/login" className="underline">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-4">
        {message && <Alert variant="success">{message}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        <FormField id="reset-email" label="Email address" required>
          <Input id="reset-email" type="email" autoComplete="email" maxLength={255} required
            value={email} onChange={(event) => setEmail(event.target.value)} />
        </FormField>
        <Button type="submit" className="w-full" isLoading={pending}>Send reset link</Button>
      </form>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { hash } = useLocation();
  const token = new URLSearchParams(hash.slice(1)).get("token");
  const validLink = token !== null && /^[A-Za-z0-9_-]{43}$/.test(token);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validLink) return;
    setPending(true);
    setError("");
    try {
      const result = await submitPasswordRequest("/api/auth/reset-password", { token, newPassword: password });
      await queryClient.cancelQueries();
      queryClient.setQueryData(authKeys.me, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
      navigate("/login", { replace: true, state: { passwordResetMessage: result.message } });
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Use at least 8 characters."
      footer={<Link to="/forgot-password" className="underline">Request a new reset link</Link>}>
      {!validLink ? (
        <Alert variant="error">Invalid or expired reset link</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          <FormField id="new-password" label="New password" required>
            <Input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={72}
              value={password} onChange={(event) => setPassword(event.target.value)} />
          </FormField>
          <Button type="submit" className="w-full" isLoading={pending}>Update password</Button>
        </form>
      )}
    </AuthLayout>
  );
}
