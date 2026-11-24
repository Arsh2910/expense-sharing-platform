CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "group_id" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "request_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_events_group_id_fkey"
        FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "audit_events_group_id_created_at_id_idx"
    ON "audit_events" ("group_id", "created_at" DESC, "id" DESC);
CREATE INDEX "audit_events_actor_id_created_at_idx"
    ON "audit_events" ("actor_id", "created_at" DESC);
CREATE INDEX "audit_events_entity_type_entity_id_idx"
    ON "audit_events" ("entity_type", "entity_id");

CREATE FUNCTION reject_audit_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Audit events are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "audit_events_append_only"
    BEFORE UPDATE OR DELETE OR TRUNCATE ON "audit_events"
    FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_event_mutation();
