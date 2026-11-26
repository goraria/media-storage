CREATE TABLE "media_storage_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"application" varchar(64) NOT NULL,
	"bucket_name" varchar(255) NOT NULL,
	"endpoint" text NOT NULL,
	"region" varchar(64) NOT NULL,
	"credentials_secret_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "media_storage_profile_app_bucket_key" ON "media_storage_profile" ("application","bucket_name");