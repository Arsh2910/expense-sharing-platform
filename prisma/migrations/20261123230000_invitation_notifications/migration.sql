CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_invitation_id_key" UNIQUE ("invitation_id"),
    CONSTRAINT "notifications_recipient_id_fkey"
        FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notifications_invitation_id_fkey"
        FOREIGN KEY ("invitation_id") REFERENCES "group_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "notifications_recipient_id_created_at_id_idx"
    ON "notifications" ("recipient_id", "created_at" DESC, "id" DESC);
CREATE INDEX "notifications_recipient_id_read_at_idx" ON "notifications" ("recipient_id", "read_at");
