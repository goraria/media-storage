ALTER TABLE "media_storage_profile" RENAME COLUMN "credentials_secret_id" TO "credentials_url";
--> statement-breakpoint
-- Preserve rows, but old Secrets Manager references cannot authorize backend access.
-- Trusted operators must re-register a credentials URL before enabling a profile.
UPDATE "media_storage_profile" SET "enabled" = false, "updated_at" = now();
