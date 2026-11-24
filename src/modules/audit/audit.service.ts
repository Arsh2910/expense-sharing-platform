import type { GroupRole, Prisma } from "../../../generated/prisma/client.js";

type SettlementMetadata = { fromUserId: string; toUserId: string };

type AuditAction =
  | { action: "GROUP_CREATED"; metadata: { name: string } }
  | { action: "GROUP_RENAMED"; metadata: { fromName: string; toName: string } }
  | { action: "GROUP_ARCHIVED" }
  | { action: "MEMBER_INVITED" | "INVITATION_REVOKED"; metadata: { invitedUserId: string | null } }
  | { action: "INVITATION_ACCEPTED" | "INVITATION_DECLINED" }
  | { action: "MEMBER_REMOVED" | "MEMBER_LEFT"; metadata: { userId: string } }
  | { action: "MEMBER_ROLE_CHANGED"; metadata: { userId: string; fromRole: GroupRole; toRole: GroupRole } }
  | { action: "EXPENSE_CREATED" | "EXPENSE_DELETED"; metadata: { description: string; version: number } }
  | { action: "EXPENSE_UPDATED"; metadata: { description: string; fromVersion: number; toVersion: number } }
  | { action: "SETTLEMENT_CREATED"; metadata: SettlementMetadata }
  | { action: "SETTLEMENT_REVERSED"; metadata: SettlementMetadata & { reversesId: string } };

type AuditEventInput = AuditAction & {
  actorId: string | null;
  groupId: string;
  entityId: string;
  requestId?: string;
};

const auditEntityTypes = {
  GROUP_CREATED: "Group",
  GROUP_RENAMED: "Group",
  GROUP_ARCHIVED: "Group",
  MEMBER_INVITED: "GroupInvitation",
  INVITATION_ACCEPTED: "GroupInvitation",
  INVITATION_DECLINED: "GroupInvitation",
  INVITATION_REVOKED: "GroupInvitation",
  MEMBER_REMOVED: "GroupMembership",
  MEMBER_LEFT: "GroupMembership",
  MEMBER_ROLE_CHANGED: "GroupMembership",
  EXPENSE_CREATED: "Expense",
  EXPENSE_UPDATED: "Expense",
  EXPENSE_DELETED: "Expense",
  SETTLEMENT_CREATED: "Settlement",
  SETTLEMENT_REVERSED: "Settlement",
} satisfies Record<AuditAction["action"], string>;

export const groupActivityActions = Object.keys(auditEntityTypes);

function auditMetadata(event: AuditAction): Prisma.InputJsonObject | undefined {
  switch (event.action) {
    case "GROUP_CREATED":
      return { name: event.metadata.name };
    case "GROUP_RENAMED": {
      const { fromName, toName } = event.metadata;
      return { fromName, toName };
    }
    case "GROUP_ARCHIVED":
    case "INVITATION_ACCEPTED":
    case "INVITATION_DECLINED":
      return undefined;
    case "MEMBER_INVITED":
    case "INVITATION_REVOKED":
      return { invitedUserId: event.metadata.invitedUserId };
    case "MEMBER_REMOVED":
    case "MEMBER_LEFT":
      return { userId: event.metadata.userId };
    case "MEMBER_ROLE_CHANGED": {
      const { userId, fromRole, toRole } = event.metadata;
      return { userId, fromRole, toRole };
    }
    case "EXPENSE_CREATED":
    case "EXPENSE_DELETED": {
      const { description, version } = event.metadata;
      return { description, version };
    }
    case "EXPENSE_UPDATED": {
      const { description, fromVersion, toVersion } = event.metadata;
      return { description, fromVersion, toVersion };
    }
    case "SETTLEMENT_CREATED": {
      const { fromUserId, toUserId } = event.metadata;
      return { fromUserId, toUserId };
    }
    case "SETTLEMENT_REVERSED": {
      const { fromUserId, toUserId, reversesId } = event.metadata;
      return { fromUserId, toUserId, reversesId };
    }
  }
}

export async function recordAuditEvent(tx: Prisma.TransactionClient, event: AuditEventInput): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorId: event.actorId,
      groupId: event.groupId,
      action: event.action,
      entityId: event.entityId,
      requestId: event.requestId,
      entityType: auditEntityTypes[event.action],
      metadata: auditMetadata(event),
    },
    select: { id: true },
  });
}
