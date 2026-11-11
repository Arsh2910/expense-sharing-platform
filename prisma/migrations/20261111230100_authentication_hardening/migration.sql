ALTER TYPE "verification_purpose" ADD VALUE 'EMAIL_CHANGE';
ALTER TABLE "users" ADD COLUMN "pending_email" VARCHAR(255);
