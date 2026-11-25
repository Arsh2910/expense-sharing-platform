import { formatMoneyDisplay } from "@/features/expenses/money";
import type { GroupActivityEvent } from "./activity.api";

const settlementDateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function settlementActivityDetails(event: GroupActivityEvent) {
  const reversed = event.action === "SETTLEMENT_REVERSED";
  const action = reversed ? "reversed" : "recorded";
  const settlement = event.settlement;
  if (!settlement) return { summary: `${action} a settlement` };

  // Reversal rows compensate the original payment in the opposite direction.
  const [payer, recipient] = reversed
    ? [settlement.toUser, settlement.fromUser]
    : [settlement.fromUser, settlement.toUser];
  const amount = formatMoneyDisplay(settlement.amountMinor, settlement.currency);
  const summary = `${action} a ${amount} settlement from ${payer?.displayName ?? "a group member"} to ${recipient?.displayName ?? "a group member"}`;
  if (reversed) return { summary };

  const date = settlementDateFormat.format(new Date(settlement.settledOn));
  const detail = [`Paid on ${date}`, settlement.note].filter(Boolean).join(" · ");
  return { summary, detail };
}

export function activityDetails(event: GroupActivityEvent) {
  const metadata = event.metadata ?? {};
  const text = (key: string) => typeof metadata[key] === "string" ? metadata[key] : undefined;
  const user = event.targetUser?.displayName;
  const expense = text("description") ?? "an expense";

  switch (event.action) {
    case "GROUP_CREATED": return { summary: `created ${text("name") ?? "the group"}` };
    case "GROUP_RENAMED": return { summary: `renamed ${text("fromName") ?? "the group"} to ${text("toName") ?? "a new name"}` };
    case "GROUP_ARCHIVED": return { summary: "archived the group" };
    case "MEMBER_INVITED": return { summary: `invited ${user ?? "someone"} to the group` };
    case "INVITATION_ACCEPTED": return { summary: "accepted an invitation to the group" };
    case "INVITATION_DECLINED": return { summary: "declined an invitation to the group" };
    case "INVITATION_REVOKED": return { summary: user ? `revoked the invitation for ${user}` : "revoked an invitation" };
    case "MEMBER_REMOVED": return { summary: `removed ${user ?? "a member"} from the group` };
    case "MEMBER_LEFT": return { summary: "left the group" };
    case "MEMBER_ROLE_CHANGED":
      return {
        summary: `changed the role for ${user ?? "a member"}`,
        detail: `${text("fromRole") ?? "Unknown"} → ${text("toRole") ?? "Unknown"}`,
      };
    case "EXPENSE_CREATED": return { summary: `added ${expense}` };
    case "EXPENSE_UPDATED":
      return {
        summary: `edited ${expense}`,
        detail: typeof metadata.fromVersion === "number" && typeof metadata.toVersion === "number"
          ? `Version ${metadata.fromVersion} → ${metadata.toVersion}` : undefined,
      };
    case "EXPENSE_DELETED": return { summary: `deleted ${expense}` };
    case "SETTLEMENT_CREATED":
    case "SETTLEMENT_REVERSED":
      return settlementActivityDetails(event);
    default: return { summary: "recorded a group action" };
  }
}
