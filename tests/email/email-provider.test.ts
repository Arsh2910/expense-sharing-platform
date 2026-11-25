import { afterEach, describe, expect, it, vi } from "vitest";
import { sendPasswordResetEmail } from "../../src/modules/email/email.service.js";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

afterEach(() => vi.unstubAllEnvs());

describe("Resend delivery", () => {
  it.each([
    [422, "validation_error", true],
    [409, "concurrent_idempotent_requests", false],
    [408, "application_error", false],
    [429, "rate_limit_exceeded", false],
    [503, "internal_server_error", false],
  ])("records a %s %s error with permanent=%s", async (statusCode, name, permanent) => {
    vi.stubEnv("RESEND_API_KEY", "test-provider-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.test");
    send.mockResolvedValue({ error: { statusCode, name, message: "Rejected reset-token\nusing test-provider-key" } });

    await expect(sendPasswordResetEmail("recipient@example.test", "reset-token", "outbox-key"))
      .rejects.toMatchObject({
        permanent,
        message: `Resend ${statusCode} (${name}): Rejected [redacted] using [redacted]`,
      });
  });
});
