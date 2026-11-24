import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { deliverEmailOutbox, pruneCompletedEmails, reconcileEmailOutbox } from "../../src/modules/email/email-outbox.service.js";
import { sendInvitationEmail, sendPasswordResetEmail } from "../../src/modules/email/email.service.js";
import { encryptOutboxToken } from "../../src/modules/email/outbox-token-crypto.js";
import { hashToken } from "../../src/modules/auth/token.service.js";
import { enqueueEmailOutboxBatch } from "../../src/queues/email.queue.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    emailOutbox: { findMany: vi.fn(), updateManyAndReturn: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    groupInvitation: { findFirst: vi.fn() },
    verificationToken: { findFirst: vi.fn() },
  },
}));
vi.mock("../../src/modules/email/email.service.js", () => ({ sendInvitationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() }));
vi.mock("../../src/queues/email.queue.js", () => ({ enqueueEmailOutboxBatch: vi.fn() }));

const now = new Date("2026-11-23T12:00:00Z");
const record = {
  id: "outbox-id",
  type: "GROUP_INVITATION",
  recipient: "recipient@example.test",
  payload: {
    invitationId: "invitation-id",
    token: "token",
    groupName: "Trip",
    expiresAt: "2026-11-24T12:00:00Z",
  },
  status: "PROCESSING" as const,
  attempts: 1,
  availableAt: new Date(now.getTime() + 300_000),
  createdAt: now,
  sentAt: null,
  lastError: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.mocked(prisma.groupInvitation.findFirst).mockResolvedValue({ id: "invitation-id" } as never);
});
afterEach(() => vi.useRealTimers());

describe("email outbox", () => {
  it("decrypts a current password reset, verifies its hash, and clears the delivered payload", async () => {
    vi.stubEnv("PASSWORD_RESET_OUTBOX_KEY", "aa".repeat(32));
    try {
      const token = "A".repeat(43);
      const payload = { userId: "user-id", encryptedToken: encryptOutboxToken(token) };
      vi.mocked(prisma.emailOutbox.updateManyAndReturn).mockResolvedValue([
        { ...record, type: "PASSWORD_RESET", payload },
      ]);
      vi.mocked(prisma.verificationToken.findFirst).mockResolvedValue({ id: "reset-id" } as never);
      await deliverEmailOutbox(record.id);

      expect(prisma.verificationToken.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ purpose: "PASSWORD_RESET", tokenHash: hashToken(token), consumedAt: null }),
      }));
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(record.recipient, token, "email-outbox/outbox-id");
      expect(prisma.emailOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "SENT", payload: {} }),
      }));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("requeues due pending, failed, and abandoned processing rows", async () => {
    vi.mocked(prisma.emailOutbox.findMany).mockResolvedValue([record]);
    await reconcileEmailOutbox();

    expect(prisma.emailOutbox.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        availableAt: { lte: now },
        attempts: { lt: 5 },
        status: { in: ["PENDING", "FAILED", "PROCESSING"] },
      },
    }));
    expect(enqueueEmailOutboxBatch).toHaveBeenCalledWith([record.id]);
  });

  it("sends only after claiming and scopes completion to that attempt", async () => {
    vi.mocked(prisma.emailOutbox.updateManyAndReturn)
      .mockResolvedValueOnce([record])
      .mockResolvedValueOnce([]);

    await Promise.all([deliverEmailOutbox(record.id), deliverEmailOutbox(record.id)]);

    expect(prisma.emailOutbox.updateManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "PROCESSING", availableAt: record.availableAt, attempts: { increment: 1 } },
    }));
    expect(sendInvitationEmail).toHaveBeenCalledExactlyOnceWith(
      { recipient: record.recipient, ...record.payload },
      "email-outbox/outbox-id",
    );
    expect(prisma.emailOutbox.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: record.id, status: "PROCESSING", attempts: 1 },
      data: { status: "SENT", sentAt: now, lastError: null, payload: {} },
    });
  });

  it("persists a retry time and keeps the provider key stable across attempts", async () => {
    vi.mocked(prisma.emailOutbox.updateManyAndReturn)
      .mockResolvedValueOnce([record])
      .mockResolvedValueOnce([{ ...record, attempts: 2 }]);
    vi.mocked(sendInvitationEmail).mockRejectedValueOnce(new Error("Provider unavailable"));

    await expect(deliverEmailOutbox(record.id)).rejects.toThrow("Email delivery failed");
    expect(prisma.emailOutbox.updateMany).toHaveBeenCalledWith({
      where: { id: record.id, status: "PROCESSING", attempts: 1 },
      data: { status: "FAILED", availableAt: new Date(now.getTime() + 30_000), lastError: "Email delivery failed" },
    });

    vi.setSystemTime(new Date(now.getTime() + 30_000));
    await deliverEmailOutbox(record.id);
    expect(vi.mocked(sendInvitationEmail).mock.calls[1]).toEqual(vi.mocked(sendInvitationEmail).mock.calls[0]);
  });

  it("skips provider delivery for an expired invitation", async () => {
    vi.mocked(prisma.emailOutbox.updateManyAndReturn).mockResolvedValue([
      { ...record, payload: { ...record.payload, expiresAt: now.toISOString() } },
    ]);

    await expect(deliverEmailOutbox(record.id)).rejects.toThrow("Invitation email expired");
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("does not send an outbox row after its invitation is revoked or replaced", async () => {
    vi.mocked(prisma.emailOutbox.updateManyAndReturn).mockResolvedValue([record]);
    vi.mocked(prisma.groupInvitation.findFirst).mockResolvedValue(null);

    await expect(deliverEmailOutbox(record.id)).rejects.toThrow("Invitation is no longer current");
    expect(sendInvitationEmail).not.toHaveBeenCalled();
    expect(prisma.emailOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "DEAD" }),
    }));
  });

  it("retires exhausted claims before re-enqueueing eligible work", async () => {
    vi.mocked(prisma.emailOutbox.findMany).mockResolvedValue([]);
    await reconcileEmailOutbox();

    expect(prisma.emailOutbox.updateMany).toHaveBeenCalledWith({
      where: {
        attempts: { gte: 5 },
        OR: [{ status: "FAILED" }, { status: "PROCESSING", availableAt: { lte: now } }],
      },
      data: { status: "DEAD" },
    });
  });

  it("prunes only terminal invitation and verification email rows after their retention period", async () => {
    await pruneCompletedEmails();
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(prisma.emailOutbox.deleteMany).toHaveBeenCalledWith({
      where: {
        type: { in: ["GROUP_INVITATION", "EMAIL_VERIFICATION", "PASSWORD_RESET"] },
        OR: [
          { status: "SENT", sentAt: { lt: cutoff } },
          { status: "DEAD", availableAt: { lt: cutoff } },
        ],
      },
    });
  });

  it("keeps an accepted send recoverable if saving SENT fails", async () => {
    vi.mocked(prisma.emailOutbox.updateManyAndReturn).mockResolvedValue([record]);
    vi.mocked(prisma.emailOutbox.updateMany).mockRejectedValueOnce(new Error("Database unavailable"));

    await expect(deliverEmailOutbox(record.id)).rejects.toThrow("Database unavailable");
    expect(prisma.emailOutbox.updateMany).toHaveBeenCalledTimes(1);
  });
});
