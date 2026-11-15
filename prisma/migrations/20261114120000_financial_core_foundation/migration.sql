-- CreateEnum
CREATE TYPE "split_type" AS ENUM ('EQUAL', 'EXACT', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "idempotency_status" AS ENUM ('PENDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(50),
    "amount" BIGINT NOT NULL,
    "split_type" "split_type" NOT NULL,
    "expense_date" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_payers" (
    "expense_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "expense_payers_pkey" PRIMARY KEY ("expense_id","user_id")
);

-- CreateTable
CREATE TABLE "expense_splits" (
    "expense_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "percent_units" BIGINT,

    CONSTRAINT "expense_splits_pkey" PRIMARY KEY ("expense_id","user_id")
);

-- CreateTable
CREATE TABLE "expense_revisions" (
    "id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changes" JSONB,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_balances" (
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "group_balances_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "settled_on" DATE NOT NULL,
    "note" VARCHAR(500),
    "reverses_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "user_id" UUID NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "request_hash" VARCHAR(128) NOT NULL,
    "resource_id" UUID,
    "status" "idempotency_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("user_id","scope","key")
);

-- CreateIndex
CREATE INDEX "expenses_group_date_idx" ON "expenses"("group_id", "expense_date" DESC, "id");

-- CreateIndex
CREATE INDEX "expenses_created_by_idx" ON "expenses"("created_by");

-- CreateIndex
CREATE INDEX "expense_payers_user_id_expense_id_idx" ON "expense_payers"("user_id", "expense_id");

-- CreateIndex
CREATE INDEX "expense_splits_user_id_expense_id_idx" ON "expense_splits"("user_id", "expense_id");

-- CreateIndex
CREATE INDEX "expense_revisions_created_by_idx" ON "expense_revisions"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "expense_revisions_expense_id_revision_key" ON "expense_revisions"("expense_id", "revision");

-- CreateIndex
CREATE INDEX "group_balances_user_id_idx" ON "group_balances"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_reverses_id_key" ON "settlements"("reverses_id");

-- CreateIndex
CREATE INDEX "settlements_group_id_from_user_id_idx" ON "settlements"("group_id", "from_user_id");

-- CreateIndex
CREATE INDEX "settlements_group_id_to_user_id_idx" ON "settlements"("group_id", "to_user_id");

-- CreateIndex
CREATE INDEX "settlements_created_by_idx" ON "settlements"("created_by");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_revisions" ADD CONSTRAINT "expense_revisions_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_revisions" ADD CONSTRAINT "expense_revisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_balances" ADD CONSTRAINT "group_balances_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_balances" ADD CONSTRAINT "group_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express these financial invariants. Keep them in this custom
-- migration and do not replace this migration with `prisma db push`.
ALTER TABLE "expenses"
    ADD CONSTRAINT "expenses_amount_positive_and_bounded"
        CHECK ("amount" > 0 AND "amount" <= 10000000000000),
    ADD CONSTRAINT "expenses_description_not_blank"
        CHECK (btrim("description") <> ''),
    ADD CONSTRAINT "expenses_version_positive"
        CHECK ("version" > 0),
    ADD CONSTRAINT "expenses_tombstone_consistent"
        CHECK (("deleted_at" IS NULL) = ("deleted_by" IS NULL));

ALTER TABLE "expense_payers"
    ADD CONSTRAINT "expense_payers_amount_positive"
        CHECK ("amount" > 0);

ALTER TABLE "expense_splits"
    ADD CONSTRAINT "expense_splits_amount_nonnegative"
        CHECK ("amount" >= 0),
    ADD CONSTRAINT "expense_splits_percent_units_bounded"
        CHECK (
            "percent_units" IS NULL
            OR "percent_units" BETWEEN 0 AND 100000000
        );

ALTER TABLE "expense_revisions"
    ADD CONSTRAINT "expense_revisions_revision_positive"
        CHECK ("revision" > 0);

ALTER TABLE "settlements"
    ADD CONSTRAINT "settlements_amount_positive_and_bounded"
        CHECK ("amount" > 0 AND "amount" <= 10000000000000),
    ADD CONSTRAINT "settlements_users_distinct"
        CHECK ("from_user_id" <> "to_user_id"),
    ADD CONSTRAINT "settlements_not_self_reversing"
        CHECK ("reverses_id" IS NULL OR "reverses_id" <> "id");

ALTER TABLE "idempotency_keys"
    ADD CONSTRAINT "idempotency_keys_scope_not_blank"
        CHECK (btrim("scope") <> ''),
    ADD CONSTRAINT "idempotency_keys_key_not_blank"
        CHECK (btrim("key") <> ''),
    ADD CONSTRAINT "idempotency_keys_request_hash_not_blank"
        CHECK (btrim("request_hash") <> '');

CREATE OR REPLACE FUNCTION "check_expense_allocations"()
RETURNS trigger AS $$
DECLARE
    exp_id uuid;
    exp_group_id uuid;
    exp_total bigint;
    exp_split_type "split_type";
    payer_sum bigint;
    split_sum bigint;
    split_count bigint;
    percent_count bigint;
    percent_sum bigint;
BEGIN
    IF TG_TABLE_NAME = 'expenses' THEN
        exp_id := COALESCE(NEW."id", OLD."id");
    ELSE
        exp_id := COALESCE(NEW."expense_id", OLD."expense_id");
    END IF;

    SELECT "group_id", "amount", "split_type"
      INTO exp_group_id, exp_total, exp_split_type
      FROM "expenses"
     WHERE "id" = exp_id;

    -- A hard delete may cascade through allocation rows. Tombstone deletion is
    -- the normal application path, but the function remains safe for cascades.
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM("amount"), 0)
      INTO payer_sum
      FROM "expense_payers"
     WHERE "expense_id" = exp_id;

    SELECT COALESCE(SUM("amount"), 0),
           COUNT(*),
           COUNT("percent_units"),
           COALESCE(SUM("percent_units"), 0)
      INTO split_sum, split_count, percent_count, percent_sum
      FROM "expense_splits"
     WHERE "expense_id" = exp_id;

    IF payer_sum <> exp_total OR split_sum <> exp_total THEN
        RAISE EXCEPTION
            'allocation mismatch on expense %: total=%, payers=%, splits=%',
            exp_id, exp_total, payer_sum, split_sum
            USING ERRCODE = '23514';
    END IF;

    IF exp_split_type = 'PERCENTAGE' THEN
        IF percent_count <> split_count OR percent_sum <> 100000000 THEN
            RAISE EXCEPTION
                'invalid percentage allocation on expense %: rows=%, percentages=%, total_units=%',
                exp_id, split_count, percent_count, percent_sum
                USING ERRCODE = '23514';
        END IF;
    ELSIF percent_count <> 0 THEN
        RAISE EXCEPTION
            'percent_units must be null for % expense %', exp_split_type, exp_id
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM (
              SELECT "user_id" FROM "expense_payers" WHERE "expense_id" = exp_id
              UNION
              SELECT "user_id" FROM "expense_splits" WHERE "expense_id" = exp_id
          ) allocation_users
         WHERE NOT EXISTS (
             SELECT 1
               FROM "group_memberships" membership
              WHERE membership."group_id" = exp_group_id
                AND membership."user_id" = allocation_users."user_id"
         )
    ) THEN
        RAISE EXCEPTION
            'expense % contains a user who has never belonged to group %',
            exp_id, exp_group_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "expense_allocations_expense"
    AFTER INSERT OR UPDATE ON "expenses"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "check_expense_allocations"();

CREATE CONSTRAINT TRIGGER "expense_allocations_payers"
    AFTER INSERT OR UPDATE OR DELETE ON "expense_payers"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "check_expense_allocations"();

CREATE CONSTRAINT TRIGGER "expense_allocations_splits"
    AFTER INSERT OR UPDATE OR DELETE ON "expense_splits"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "check_expense_allocations"();

CREATE OR REPLACE FUNCTION "reject_future_expense_date"()
RETURNS trigger AS $$
BEGIN
    IF NEW."expense_date" > CURRENT_DATE THEN
        RAISE EXCEPTION 'expense_date cannot be in the future'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "expenses_reject_future_date"
    BEFORE INSERT OR UPDATE OF "expense_date" ON "expenses"
    FOR EACH ROW EXECUTE FUNCTION "reject_future_expense_date"();

CREATE OR REPLACE FUNCTION "prevent_group_currency_change_after_expense"()
RETURNS trigger AS $$
BEGIN
    IF NEW."currency" IS DISTINCT FROM OLD."currency"
       AND EXISTS (
           SELECT 1 FROM "expenses" WHERE "group_id" = OLD."id"
       ) THEN
        RAISE EXCEPTION 'group currency cannot change after the first expense'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "groups_currency_immutable_after_expense"
    BEFORE UPDATE OF "currency" ON "groups"
    FOR EACH ROW EXECUTE FUNCTION "prevent_group_currency_change_after_expense"();

