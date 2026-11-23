ALTER TABLE "notifications"
    ALTER COLUMN "invitation_id" DROP NOT NULL,
    ADD COLUMN "settlement_id" UUID,
    ADD CONSTRAINT "notifications_one_source_check"
        CHECK (("invitation_id" IS NULL) <> ("settlement_id" IS NULL)),
    ADD CONSTRAINT "notifications_settlement_id_fkey"
        FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "notifications_settlement_id_recipient_id_key"
    ON "notifications" ("settlement_id", "recipient_id");
