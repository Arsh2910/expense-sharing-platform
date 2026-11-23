ALTER TYPE "invitation_status" ADD VALUE 'EXPIRED';

ALTER TABLE "group_invitations"
    DROP CONSTRAINT "group_invitations_status_dates_check",
    ADD CONSTRAINT "group_invitations_status_dates_check" CHECK (
        ("status"::text IN ('PENDING', 'EXPIRED') AND "accepted_at" IS NULL AND "declined_at" IS NULL AND "revoked_at" IS NULL)
        OR ("status" = 'ACCEPTED' AND "accepted_at" IS NOT NULL AND "declined_at" IS NULL AND "revoked_at" IS NULL)
        OR ("status" = 'DECLINED' AND "accepted_at" IS NULL AND "declined_at" IS NOT NULL AND "revoked_at" IS NULL)
        OR ("status" = 'REVOKED' AND "accepted_at" IS NULL AND "declined_at" IS NULL AND "revoked_at" IS NOT NULL)
    );

CREATE INDEX "group_invitations_pending_expiration_idx"
    ON "group_invitations" ("expires_at") WHERE "status" = 'PENDING';

ALTER TYPE "email_outbox_status" ADD VALUE 'DEAD';
