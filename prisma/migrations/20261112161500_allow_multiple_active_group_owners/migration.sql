-- Drop the index that prevents multiple active owners per group, to comply with the frozen domain rule:
-- "Multiple OWNER memberships are allowed. Do not introduce an exactly-one-OWNER constraint."
DROP INDEX IF EXISTS "one_active_group_owner";

