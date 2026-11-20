CREATE TYPE "email_outbox_status" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "email_outbox_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_outbox_status_available_at_idx"
    ON "email_outbox" ("status", "available_at");
