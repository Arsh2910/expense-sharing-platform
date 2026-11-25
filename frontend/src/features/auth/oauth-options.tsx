import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, apiUrl } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/api/errors";

const providerNames = { google: "Google", github: "GitHub" } as const;
type Provider = keyof typeof providerNames;
const returnPathKey = "splitcircle:oauth-return";

function localReturnPath(path?: string | null) {
  if (!path?.startsWith("/") || path.startsWith("//")) return "/";
  const url = new URL(path, window.location.origin);
  return url.origin === window.location.origin && url.pathname !== "/oauth/complete"
    ? `${url.pathname}${url.search}${url.hash}`
    : "/";
}

export function OAuthCompletePage() {
  const [target] = useState(() => localReturnPath(sessionStorage.getItem(returnPathKey)));
  useEffect(() => sessionStorage.removeItem(returnPathKey), []);
  return <Navigate to={target} replace />;
}

const messages = new Map([
  ["unavailable", "That sign-in option is currently unavailable."],
  ["provider", "The sign-in provider did not respond as expected. Please try again."],
  ["email", "Use a provider account with a verified email. When connecting an account, its email must match your SplitCircle email."],
  ["link_required", "An account already uses that email. Sign in with your existing method, then connect the provider in Account settings."],
  ["conflict", "This provider account is already linked, or a different account from that provider is connected."],
  ["session", "Sign in again before using this option."],
  ["expired", "The sign-in request expired. Please start again."],
  ["cancelled", "Sign-in was cancelled."],
  ["linked", "Your sign-in provider is connected."],
]);

export function OAuthNotice() {
  const [params] = useSearchParams();
  const result = params.get("oauth");
  if (result === "verify_locally") {
    return (
      <Alert variant="info" title="Verify your email with SplitCircle">
        <Link to="/register" className="font-medium underline underline-offset-2">Create an account with email</Link>
        {" "}and verify the address from your inbox. Then connect Google under Account settings.
      </Alert>
    );
  }
  if (!result || !messages.has(result)) return null;
  return <Alert variant={result === "linked" ? "success" : "info"}>{messages.get(result)}</Alert>;
}

export function OAuthOptions({ returnTo }: { returnTo?: string }) {
  const { data } = useQuery({
    queryKey: ["auth", "oauth-providers"],
    queryFn: () => apiRequest<{ data: Provider[] }>("/api/auth/oauth/providers"),
    staleTime: 60_000,
    retry: false,
  });
  const providers = data?.data ?? [];
  if (!providers.length) return null;
  return (
    <div className="grid justify-items-center gap-3 border-t border-border-subtle pt-4">
      {providers.map((provider) => (
        <Button
          asChild
          key={provider}
          variant={provider === "google" ? "ghost" : "outline"}
          className="h-10 w-[180px] p-0"
        >
          <a
            href={apiUrl(`/api/auth/oauth/${provider}/start`)}
            onClick={() => sessionStorage.setItem(returnPathKey, localReturnPath(returnTo))}
          >
            {provider === "google"
              ? <img src="/google-sign-in.png" width={180} height={40} alt="Sign in with Google" />
              : (
                <>
                  <svg className="size-4 shrink-0" viewBox="0 0 19 19" aria-hidden="true">
                    <use href="/icons.svg#github-icon" />
                  </svg>
                  Continue with GitHub
                </>
              )}
          </a>
        </Button>
      ))}
    </div>
  );
}

export function ConnectedSignInOptions({ userId }: { userId: string }) {
  const connect = useMutation({
    mutationFn: async (provider: Provider) => {
      const path = `/api/auth/oauth/${provider}/link`;
      const { data } = await apiRequest<{ data: { ticket: string } }>(path, { method: "POST", body: {} });

      // A top-level POST lets the API set the OAuth flow cookie in navigation
      // context while keeping the one-time ticket out of the URL.
      const form = document.createElement("form");
      form.hidden = true;
      form.method = "post";
      form.action = apiUrl(`${path}/continue`);
      const ticket = document.createElement("input");
      ticket.type = "hidden";
      ticket.name = "ticket";
      ticket.value = data.ticket;
      form.append(ticket);
      document.body.append(form);
      form.submit();
    },
  });
  const { data } = useQuery({
    queryKey: ["oauth-links", userId],
    queryFn: () => apiRequest<{ data: {
      hasPassword: boolean;
      providers: { provider: Provider; linked: boolean }[];
    } }>("/api/auth/oauth/links"),
    retry: false,
  });
  const options = data?.data;
  if (!options || (!options.providers.length && options.hasPassword)) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in methods</CardTitle>
        <CardDescription>Connect a provider that uses your verified SplitCircle email.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {connect.error && <Alert variant="error">{getErrorMessage(connect.error)}</Alert>}
        {options.providers.map(({ provider, linked }) => (
          <div key={provider} className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">{providerNames[provider]}</span>
            {linked ? <Badge variant="accent">Connected</Badge> : (
              <Button variant="outline" size="sm" disabled={connect.isPending} onClick={() => connect.mutate(provider)}>
                Connect {providerNames[provider]}
              </Button>
            )}
          </div>
        ))}
        {!options.hasPassword && (
          <p className="text-sm text-ink-secondary">
            To set a password for email sign-in or account changes, sign out and choose Forgot password on the sign-in page.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
