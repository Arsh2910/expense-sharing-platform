import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { deliverEmailOutbox, reconcileEmailOutbox } from "../../src/modules/email/email-outbox.service.js";
import { sendInvitationEmail } from "../../src/modules/email/email.service.js";
import { enqueueEmailOutboxBatch } from "../../src/queues/email.queue.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { emailOutbox: { findMany: vi.fn(), updateManyAndReturn: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("../../src/modules/email/email.service.js", () => ({ sendInvitationEmail: vi.fn() }));
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
});
afterEach(() => vi.useRealTimers());

describe("email outbox", () => {
  it("requeues due pending, failed, and abandoned processing rows", async () => {
    vi.mocked(prisma.emailOutbox.findMany).mockResolvedValue([record]);
    await reconcileEmailOutbox();

    expect(prisma.emailOutbox.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        availableAt: { lte: now },
        OR: [
          { status: "PROCESSING" },
          { status: { in: ["PENDING", "FAILED"] }, attempts: { lt: 5 } },
        ],
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
      data: { status: "SENT", sentAt: now, lastError: null },
    });
  });

  it("persists a retry time and keeps the provider key stable across attempts", async () => {
    vi.mocked(prisma.emailOutbox.updateManyAndReturn)
      .mockResolvedValueOnce([record])
      .mockResolvedValueOnce([{ ...record, attempts: 2 }]);
    vi.mocked(sendInvitationEmail).mockRejectedValueOnce(new Error("Provider unavailable"));

    await expect(deliverEmailOutbox(record.id)).rejects.toThrow("Provider unavailable");
    expect(prisma.emailOutbox.updateMany).toHaveBeenCalledWith({
      where: { id: record.id, status: "PROCESSING", attempts: 1 },
      data: { status: "FAILED", availableAt: new Date(now.getTime() + 30_000), lastError: "Provider unavailable" },
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

  it("keeps an accepted send recoverable if saving SENT fails", async () => {
    vi.mocked(prisma.emailOutbox.updateManyAndReturn).mockResolvedValue([record]);
    vi.mocked(prisma.emailOutbox.updateMany).mockRejectedValueOnce(new Error("Database unavailable"));

    await expect(deliverEmailOutbox(record.id)).rejects.toThrow("Database unavailable");
    expect(prisma.emailOutbox.updateMany).toHaveBeenCalledTimes(1);
  });
});
