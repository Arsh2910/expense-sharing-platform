ALTER TABLE "notifications"
    DROP CONSTRAINT "notifications_one_source_check",
    ADD COLUMN "expense_revision_id" UUID,
    ADD CONSTRAINT "notifications_one_source_check"
        CHECK (num_nonnulls("invitation_id", "settlement_id", "expense_revision_id") = 1),
    ADD CONSTRAINT "notifications_expense_revision_id_fkey"
        FOREIGN KEY ("expense_revision_id") REFERENCES "expense_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "notifications_expense_revision_id_recipient_id_key"
    ON "notifications" ("expense_revision_id", "recipient_id");
