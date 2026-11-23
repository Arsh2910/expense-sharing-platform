import { Resend } from "resend";

export type InvitationEmail = Readonly<{
  recipient: string;
  invitationId: string;
  token: string;
  groupName: string;
  expiresAt: string;
}>;

export type VerificationEmail = Readonly<{
  recipient: string;
  token: string;
  purpose: "EMAIL" | "EMAIL_CHANGE";
}>;

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailDeliveryError("RESEND_API_KEY is not configured");
  return new Resend(apiKey);
}

function getFromAddress() {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new EmailDeliveryError("RESEND_FROM_EMAIL is not configured");
  return from;
}

function getAppBaseUrl() {
  return process.env.APP_BASE_URL ?? "http://localhost:5173";
}

function invitationHtml(input: InvitationEmail) {
  const url = `${getAppBaseUrl()}/invitations/accept?invitationId=${encodeURIComponent(input.invitationId)}&token=${encodeURIComponent(input.token)}`;
  return `
    <h1>You're invited to join ${escapeHtml(input.groupName)}</h1>
    <p>Open the link below to review and accept the invitation.</p>
    <p><a href="${escapeHtml(url)}">Accept invitation</a></p>
    <p>This invitation expires on ${escapeHtml(input.expiresAt)}.</p>
  `;
}

function verificationHtml(input: VerificationEmail) {
  const url = `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(input.token)}`;
  const subject = input.purpose === "EMAIL_CHANGE" ? "Confirm your new email address" : "Verify your email address";
  return `<h1>${subject}</h1><p><a href="${escapeHtml(url)}">Continue</a></p>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]!);
}

export async function sendInvitationEmail(input: InvitationEmail, idempotencyKey: string) {
  const { error } = await getResend().emails.send({
    from: getFromAddress(),
    to: [input.recipient],
    subject: `Invitation to join ${input.groupName}`,
    html: invitationHtml(input),
  }, { idempotencyKey });
  if (error) throw new EmailDeliveryError(error.message);
}

export async function sendVerificationEmail(input: VerificationEmail, idempotencyKey: string) {
  const { error } = await getResend().emails.send({
    from: getFromAddress(),
    to: [input.recipient],
    subject: input.purpose === "EMAIL_CHANGE" ? "Confirm your new email address" : "Verify your email address",
    html: verificationHtml(input),
  }, { idempotencyKey });
  if (error) throw new EmailDeliveryError(error.message);
}
