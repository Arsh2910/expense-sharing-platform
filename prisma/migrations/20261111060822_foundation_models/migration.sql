
-- Enums
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'DEACTIVATED');
CREATE TYPE "group_role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- Users
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(30),
    "display_name" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Groups
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "groups_name_not_empty"
        CHECK (length(trim("name")) > 0),
    CONSTRAINT "groups_currency_format"
        CHECK ("currency" ~ '^[A-Z]{3}$')
);

-- Group memberships
CREATE TABLE "group_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "role" "group_role" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "membership_dates_check"
        CHECK ("left_at" IS NULL OR "joined_at" <= "left_at")
);

-- User indexes
CREATE UNIQUE INDEX "users_username_key"
ON "users" ("username");

CREATE UNIQUE INDEX "users_email_lower_unique"
ON "users" (LOWER("email"));

-- Membership indexes
CREATE INDEX "group_memberships_group_id_idx"
ON "group_memberships" ("group_id");

CREATE INDEX "group_memberships_user_id_idx"
ON "group_memberships" ("user_id");

CREATE UNIQUE INDEX "group_memberships_id_group_id_key"
ON "group_memberships" ("id", "group_id");

CREATE UNIQUE INDEX "one_active_membership"
ON "group_memberships" ("user_id", "group_id")
WHERE "left_at" IS NULL;

CREATE UNIQUE INDEX "one_active_group_owner"
ON "group_memberships" ("group_id")
WHERE "role" = 'OWNER' AND "left_at" IS NULL;

-- Foreign keys
ALTER TABLE "group_memberships"
ADD CONSTRAINT "group_memberships_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users" ("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "group_memberships"
ADD CONSTRAINT "group_memberships_group_id_fkey"
FOREIGN KEY ("group_id") REFERENCES "groups" ("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
