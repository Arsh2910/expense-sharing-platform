import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { groupsKeys } from "@/features/groups/groups.queries";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/utils/format";
import { invitationsApi, invitationsKeys, type Invitation } from "./invitations.api";

export function InvitationsPage({ fromEmail = false }: { fromEmail?: boolean }) {
  const [params] = useSearchParams();
  const linkedId = params.get("invitationId");
  const focused = fromEmail || Boolean(linkedId);
  const token = fromEmail ? params.get("token") : null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const queryKey = invitationsKeys.inbox(user?.id ?? "");
  const inbox = useQuery({ queryKey, queryFn: invitationsApi.listMine, enabled: Boolean(user) });
  const response = useMutation({
    mutationFn: ({ invitation, action }: { invitation: Invitation; action: "accept" | "decline" }) =>
      invitationsApi.respond(invitation.id, action, token ?? undefined),
    onSuccess: (_, { invitation, action }) => {
      void queryClient.invalidateQueries({ queryKey });
      if (action === "accept") {
        void queryClient.invalidateQueries({ queryKey: groupsKeys.all });
        navigate(`/groups/${invitation.groupId}`, { replace: true });
      } else if (fromEmail) {
        navigate("/invitations", { replace: true });
      }
    },
  });
  const invitations = focused
    ? inbox.data?.filter((invitation) => invitation.id === linkedId && (!fromEmail || Boolean(token)))
    : inbox.data;

  return (
    <div className="space-y-5">
      <PageHeader title={focused ? "Review invitation" : "Invitations"}
        backTo={focused ? { href: "/invitations", label: "All invitations" } : undefined} />
      {inbox.isPending && <p role="status">Loading invitations…</p>}
      {inbox.isError && <Alert variant="error">{getErrorMessage(inbox.error)}</Alert>}
      {response.isError && (
        <Alert variant="error">
          {getErrorMessage(response.error)}
          {fromEmail && <Link className="ml-2 underline" to="/invitations">Open your inbox</Link>}
        </Alert>
      )}
      {response.isSuccess && response.variables.action === "decline" && (
        <Alert variant="success">Invitation declined.</Alert>
      )}
      {invitations?.length === 0 && (
        <Alert>{fromEmail
          ? "This invitation is unavailable. Check that you signed in with the email address that received it."
          : focused ? "This invitation is no longer pending." : "You have no pending invitations."}</Alert>
      )}
      {invitations?.map((invitation) => (
        <Card key={invitation.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
            <div>
              <h2 className="break-words font-semibold text-ink">{invitation.group.name}</h2>
              <p className="text-sm text-ink-secondary">Expires {formatDate(invitation.expiresAt)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={response.isPending}
                onClick={() => response.mutate({ invitation, action: "decline" })}>Decline</Button>
              <Button disabled={response.isPending}
                onClick={() => response.mutate({ invitation, action: "accept" })}>Accept invitation</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
