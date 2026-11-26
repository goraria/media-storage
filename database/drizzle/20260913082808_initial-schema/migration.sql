CREATE TYPE "media_job_type" AS ENUM('resize', 'crop', 'optimize', 'transcode', 'thumbnail', 'preview', 'convert', 'extract');--> statement-breakpoint
CREATE TYPE "media_permission" AS ENUM('view', 'download', 'manage');--> statement-breakpoint
CREATE TYPE "media_status" AS ENUM('pending', 'uploading', 'processing', 'ready', 'failed', 'deleted');--> statement-breakpoint
CREATE TYPE "media_type" AS ENUM('image', 'video', 'audio', 'document', 'attachment');--> statement-breakpoint
CREATE TYPE "media_variant_kind" AS ENUM('original', 'optimized', 'thumbnail', 'preview', 'transcode', 'adaptive_stream', 'document_preview', 'extracted_text');--> statement-breakpoint
CREATE TYPE "media_visibility" AS ENUM('private', 'unlisted', 'public');--> statement-breakpoint
CREATE TYPE "user_status" AS ENUM('active', 'inactive', 'suspended', 'deleted');--> statement-breakpoint
CREATE TABLE "media_access_grant" (
	"asset_id" uuid,
	"grantee_type" varchar(32),
	"grantee_id" text,
	"permission" "media_permission",
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_access_grant_pkey" PRIMARY KEY("asset_id","grantee_type","grantee_id","permission")
);
--> statement-breakpoint
CREATE TABLE "media_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_user_id" uuid,
	"bucket_id" uuid NOT NULL,
	"application" varchar(64) NOT NULL,
	"resource_type" varchar(64),
	"resource_id" text,
	"type" "media_type" NOT NULL,
	"status" "media_status" DEFAULT 'pending'::"media_status" NOT NULL,
	"visibility" "media_visibility" DEFAULT 'private'::"media_visibility" NOT NULL,
	"cloudinary_asset_id" text,
	"cloudinary_public_id" text NOT NULL,
	"delivery_path" text NOT NULL,
	"public_url" text,
	"secure_url" text,
	"original_filename" text,
	"mime_type" varchar(255),
	"format" varchar(32),
	"bytes" bigint,
	"width" integer,
	"height" integer,
	"duration" numeric(14,3),
	"page_count" integer,
	"checksum" text,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"provider_metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "media_asset_bytes_check" CHECK ("bytes" is null or "bytes" >= 0),
	CONSTRAINT "media_asset_width_check" CHECK ("width" is null or "width" > 0),
	CONSTRAINT "media_asset_height_check" CHECK ("height" is null or "height" > 0)
);
--> statement-breakpoint
CREATE TABLE "media_bucket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"application" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"cloudinary_folder" text NOT NULL,
	"visibility" "media_visibility" DEFAULT 'private'::"media_visibility" NOT NULL,
	"allowed_types" "media_type"[] NOT NULL,
	"max_file_size" bigint,
	"lifecycle" jsonb DEFAULT '{}' NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_processing_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"asset_id" uuid NOT NULL,
	"type" "media_job_type" NOT NULL,
	"status" "media_status" DEFAULT 'pending'::"media_status" NOT NULL,
	"input" jsonb DEFAULT '{}' NOT NULL,
	"output" jsonb DEFAULT '{}' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"error" text,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_signed_url" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"asset_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"permission" "media_permission" DEFAULT 'view'::"media_permission" NOT NULL,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_signed_url_use_count_check" CHECK ("use_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "media_upload_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid,
	"bucket_id" uuid NOT NULL,
	"asset_id" uuid,
	"cloudinary_public_id" text NOT NULL,
	"status" "media_status" DEFAULT 'pending'::"media_status" NOT NULL,
	"upload_parameters" jsonb DEFAULT '{}' NOT NULL,
	"error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_variant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"asset_id" uuid NOT NULL,
	"kind" "media_variant_kind" NOT NULL,
	"name" varchar(128) NOT NULL,
	"cloudinary_public_id" text NOT NULL,
	"url" text NOT NULL,
	"secure_url" text NOT NULL,
	"format" varchar(32),
	"bytes" bigint,
	"width" integer,
	"height" integer,
	"duration" numeric(14,3),
	"transformation" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"external_user_id" text NOT NULL UNIQUE,
	"name" text DEFAULT '' NOT NULL,
	"username" varchar(64),
	"role" varchar(32) DEFAULT 'user' NOT NULL,
	"email" varchar(255) NOT NULL UNIQUE,
	"image" text,
	"status" "user_status" DEFAULT 'active'::"user_status" NOT NULL,
	"ban_expires" timestamp with time zone,
	"banned_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_cloudinary_public_id_key" ON "media_asset" ("cloudinary_public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_delivery_path_key" ON "media_asset" ("delivery_path");--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_cloudinary_asset_id_key" ON "media_asset" ("cloudinary_asset_id");--> statement-breakpoint
CREATE INDEX "media_asset_application_resource_idx" ON "media_asset" ("application","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "media_asset_owner_created_at_idx" ON "media_asset" ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "media_asset_bucket_status_idx" ON "media_asset" ("bucket_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "media_bucket_application_name_key" ON "media_bucket" ("application","name");--> statement-breakpoint
CREATE UNIQUE INDEX "media_bucket_cloudinary_folder_key" ON "media_bucket" ("cloudinary_folder");--> statement-breakpoint
CREATE INDEX "media_processing_job_status_scheduled_at_idx" ON "media_processing_job" ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "media_processing_job_asset_id_idx" ON "media_processing_job" ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_signed_url_token_hash_key" ON "media_signed_url" ("token_hash");--> statement-breakpoint
CREATE INDEX "media_signed_url_asset_expires_at_idx" ON "media_signed_url" ("asset_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_upload_session_public_id_key" ON "media_upload_session" ("cloudinary_public_id");--> statement-breakpoint
CREATE INDEX "media_upload_session_user_status_idx" ON "media_upload_session" ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "media_variant_asset_name_key" ON "media_variant" ("asset_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "media_variant_cloudinary_public_id_key" ON "media_variant" ("cloudinary_public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_username_lower_key" ON "user" (lower("username"));--> statement-breakpoint
CREATE INDEX "user_external_user_id_idx" ON "user" ("external_user_id");--> statement-breakpoint
CREATE INDEX "user_last_seen_at_idx" ON "user" ("last_seen_at");--> statement-breakpoint
ALTER TABLE "media_access_grant" ADD CONSTRAINT "media_access_grant_asset_id_media_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_asset"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_owner_user_id_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_bucket_id_media_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "media_bucket"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "media_processing_job" ADD CONSTRAINT "media_processing_job_asset_id_media_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_asset"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media_signed_url" ADD CONSTRAINT "media_signed_url_asset_id_media_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_asset"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media_upload_session" ADD CONSTRAINT "media_upload_session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "media_upload_session" ADD CONSTRAINT "media_upload_session_bucket_id_media_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "media_bucket"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "media_upload_session" ADD CONSTRAINT "media_upload_session_asset_id_media_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_asset"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "media_variant" ADD CONSTRAINT "media_variant_asset_id_media_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_asset"("id") ON DELETE CASCADE;