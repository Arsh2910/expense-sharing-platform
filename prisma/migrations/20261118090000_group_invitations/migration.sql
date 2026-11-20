CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

CREATE TABLE "group_invitations" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "invited_user_id" UUID,
    "invited_email" VARCHAR(255),
    "token_hash" VARCHAR(128),
    "invited_by" UUID NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "declined_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "group_invitations_token_hash_key" UNIQUE ("token_hash"),
    CONSTRAINT "group_invitations_target_check" CHECK (
        ("invited_user_id" IS NOT NULL AND "invited_email" IS NULL)
        OR ("invited_user_id" IS NULL AND "invited_email" IS NOT NULL)
    ),
    CONSTRAINT "group_invitations_token_check" CHECK (
        ("invited_user_id" IS NOT NULL AND "token_hash" IS NULL)
        OR ("invited_email" IS NOT NULL AND "token_hash" IS NOT NULL)
    ),
    CONSTRAINT "group_invitations_status_dates_check" CHECK (
        ("status" = 'PENDING' AND "accepted_at" IS NULL AND "declined_at" IS NULL AND "revoked_at" IS NULL)
        OR ("status" = 'ACCEPTED' AND "accepted_at" IS NOT NULL AND "declined_at" IS NULL AND "revoked_at" IS NULL)
        OR ("status" = 'DECLINED' AND "accepted_at" IS NULL AND "declined_at" IS NOT NULL AND "revoked_at" IS NULL)
        OR ("status" = 'REVOKED' AND "accepted_at" IS NULL AND "declined_at" IS NULL AND "revoked_at" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "group_invitations_pending_user_key"
    ON "group_invitations" ("group_id", "invited_user_id")
    WHERE "status" = 'PENDING' AND "invited_user_id" IS NOT NULL;

CREATE UNIQUE INDEX "group_invitations_pending_email_key"
    ON "group_invitations" ("group_id", "invited_email")
    WHERE "status" = 'PENDING' AND "invited_email" IS NOT NULL;

CREATE INDEX "group_invitations_group_status_idx"
    ON "group_invitations" ("group_id", "status");
CREATE INDEX "group_invitations_invited_user_status_idx"
    ON "group_invitations" ("invited_user_id", "status");
CREATE INDEX "group_invitations_invited_email_status_idx"
    ON "group_invitations" ("invited_email", "status");

ALTER TABLE "group_invitations"
    ADD CONSTRAINT "group_invitations_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_invitations"
    ADD CONSTRAINT "group_invitations_invited_user_id_fkey"
    FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_invitations"
    ADD CONSTRAINT "group_invitations_invited_by_fkey"
    FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
