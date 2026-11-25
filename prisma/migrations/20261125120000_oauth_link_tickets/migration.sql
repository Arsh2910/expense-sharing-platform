CREATE TABLE "oauth_link_tickets" (
    "token_hash" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "session_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "oauth_link_tickets_pkey" PRIMARY KEY ("token_hash"),
    CONSTRAINT "oauth_link_tickets_session_id_fkey"
        FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "oauth_link_tickets_expires_at_idx" ON "oauth_link_tickets"("expires_at");
