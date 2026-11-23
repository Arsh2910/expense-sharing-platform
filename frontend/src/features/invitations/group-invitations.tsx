import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/utils/format";
import { invitationsApi, invitationsKeys } from "./invitations.api";

export function GroupInvitations({ groupId, archived }: { groupId: string; archived: boolean }) {
  const [target, setTarget] = useState("");
  const queryClient = useQueryClient();
  const queryKey = invitationsKeys.group(groupId);
  const invitations = useQuery({ queryKey, queryFn: () => invitationsApi.listGroup(groupId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const create = useMutation({
    mutationFn: (value: string) => invitationsApi.create(
      groupId, value.includes("@") ? { email: value } : { username: value },
    ),
    onSuccess: () => {
      setTarget("");
      return refresh();
    },
  });
  const manage = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "resend" | "revoke" }) =>
      invitationsApi.manage(groupId, id, action),
    onSettled: refresh,
  });

  return (
    <Card>
      <CardHeader><CardTitle>Group invitations</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {!archived && (
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(event) => {
            event.preventDefault();
            create.mutate(target.trim());
          }}>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="invite-target">Username or email address</Label>
              <Input id="invite-target" value={target} required maxLength={255}
                onChange={(event) => setTarget(event.target.value)} />
            </div>
            <Button type="submit" isLoading={create.isPending} disabled={!target.trim()}>Send invitation</Button>
          </form>
        )}
        {create.isError && <Alert variant="error">{getErrorMessage(create.error)}</Alert>}
        {create.isSuccess && (
          <Alert variant="success">
            {create.data.data.invitedEmail ? "Invitation email queued." : "Invitation added to the recipient’s inbox."}
          </Alert>
        )}
        {manage.isError && <Alert variant="error">{getErrorMessage(manage.error)}</Alert>}
        {manage.isSuccess && (
          <Alert variant="success">
            {manage.variables.action === "resend" ? "A new invitation email was queued." : "Invitation revoked."}
          </Alert>
        )}
        {invitations.isPending && <p role="status">Loading invitations…</p>}
        {invitations.isError && <Alert variant="error">{getErrorMessage(invitations.error)}</Alert>}
        {invitations.data?.length === 0 && <p className="text-sm text-[#52525B]">No invitations yet.</p>}
        <ul className="divide-y divide-[#E7E5E0]">
          {invitations.data?.map((invitation) => (
            <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 space-y-1">
                <p className="break-all text-sm font-medium">
                  {invitation.invitedEmail ?? invitation.invitedUser?.username ?? invitation.invitedUser?.displayName}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral">{invitation.status.toLowerCase()}</Badge>
                  {invitation.status === "PENDING" && (
                    <span className="text-xs text-[#52525B]">Expires {formatDate(invitation.expiresAt)}</span>
                  )}
                </div>
              </div>
              {invitation.status === "PENDING" && (
                <div className="flex gap-2">
                  {!archived && invitation.invitedEmail && (
                    <Button variant="outline" size="sm" disabled={manage.isPending}
                      onClick={() => manage.mutate({ id: invitation.id, action: "resend" })}>Resend</Button>
                  )}
                  <Button variant="outline" size="sm" disabled={manage.isPending}
                    onClick={() => manage.mutate({ id: invitation.id, action: "revoke" })}>Revoke</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
