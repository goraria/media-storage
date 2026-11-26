CREATE TABLE "media_upload_part" (
	"upload_session_id" uuid,
	"part_number" integer,
	"etag" text NOT NULL,
	"bytes" bigint NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_upload_part_pkey" PRIMARY KEY("upload_session_id","part_number"),
	CONSTRAINT "media_upload_part_number_check" CHECK ("part_number" > 0),
	CONSTRAINT "media_upload_part_bytes_check" CHECK ("bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "media_asset" RENAME COLUMN "cloudinary_public_id" TO "r2_key";--> statement-breakpoint
ALTER TABLE "media_asset" RENAME COLUMN "cloudinary_asset_id" TO "r2_version_id";--> statement-breakpoint
ALTER TABLE "media_bucket" RENAME COLUMN "cloudinary_folder" TO "storage_prefix";--> statement-breakpoint
ALTER TABLE "media_upload_session" RENAME COLUMN "cloudinary_public_id" TO "r2_key";--> statement-breakpoint
ALTER TABLE "media_variant" RENAME COLUMN "cloudinary_public_id" TO "r2_key";--> statement-breakpoint
ALTER INDEX "media_asset_cloudinary_public_id_key" RENAME TO "media_asset_r2_key_key";--> statement-breakpoint
ALTER INDEX "media_upload_session_public_id_key" RENAME TO "media_upload_session_r2_key_key";--> statement-breakpoint
ALTER INDEX "media_variant_cloudinary_public_id_key" RENAME TO "media_variant_r2_key_key";--> statement-breakpoint
DROP INDEX "media_asset_cloudinary_asset_id_key";--> statement-breakpoint
DROP INDEX "media_bucket_cloudinary_folder_key";--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "media_bucket" ADD COLUMN "r2_bucket_name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "media_upload_session" ADD COLUMN "r2_upload_id" text;--> statement-breakpoint
ALTER TABLE "media_asset" DROP COLUMN "secure_url";--> statement-breakpoint
ALTER TABLE "media_variant" DROP COLUMN "secure_url";--> statement-breakpoint
CREATE UNIQUE INDEX "media_bucket_r2_bucket_prefix_key" ON "media_bucket" ("r2_bucket_name","storage_prefix");--> statement-breakpoint
ALTER TABLE "media_upload_part" ADD CONSTRAINT "media_upload_part_s1rUTfoHrMu1_fkey" FOREIGN KEY ("upload_session_id") REFERENCES "media_upload_session"("id") ON DELETE CASCADE;