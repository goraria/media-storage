export { rateLimit } from "@/database/rate-limit";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm/_relations";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestampConfig = { mode: "date", withTimezone: true } as const;

export const userStatus = pgEnum("user_status", [
  "active",
  "inactive",
  "suspended",
  "deleted",
]);

export const mediaType = pgEnum("media_type", [
  "image",
  "video",
  "audio",
  "document",
  "attachment",
]);

export const mediaVisibility = pgEnum("media_visibility", [
  "private",
  "unlisted",
  "public",
]);

export const mediaStatus = pgEnum("media_status", [
  "pending",
  "uploading",
  "processing",
  "ready",
  "failed",
  "deleted",
]);

export const mediaVariantKind = pgEnum("media_variant_kind", [
  "original",
  "optimized",
  "thumbnail",
  "preview",
  "transcode",
  "adaptive_stream",
  "document_preview",
  "extracted_text",
]);

export const mediaJobType = pgEnum("media_job_type", [
  "resize",
  "crop",
  "optimize",
  "transcode",
  "thumbnail",
  "preview",
  "convert",
  "extract",
]);

export const mediaPermission = pgEnum("media_permission", [
  "view",
  "download",
  "manage",
]);

export const user = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalUserId: text("external_user_id").notNull().unique(),
    name: text("name").notNull().default(""),
    username: varchar("username", { length: 64 }),
    role: varchar("role", { length: 32 }).notNull().default("user"),
    email: varchar("email", { length: 255 }).notNull().unique(),
    image: text("image"),
    status: userStatus("status").notNull().default("active"),
    banExpires: timestamp("ban_expires", timestampConfig),
    bannedAt: timestamp("banned_at", timestampConfig),
    deletedAt: timestamp("deleted_at", timestampConfig),
    metadata: jsonb("metadata").notNull().default(sql.raw("'{}'::jsonb")),
    lastSeenAt: timestamp("last_seen_at", timestampConfig),
    syncedAt: timestamp("synced_at", timestampConfig).notNull().defaultNow(),
    createdAt: timestamp("created_at", timestampConfig).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", timestampConfig).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_username_lower_key").on(sql`lower(${table.username})`),
    index("user_external_user_id_idx").on(table.externalUserId),
    index("user_last_seen_at_idx").on(table.lastSeenAt),
  ],
);

// Provider credentials live in each application's backend, never in DB metadata.
export const mediaStorageProfile = pgTable(
  "media_storage_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    application: varchar("application", { length: 64 }).notNull(),
    bucketName: varchar("bucket_name", { length: 255 }).notNull(),
    endpoint: text("endpoint").notNull(),
    region: varchar("region", { length: 64 }).notNull(),
    credentialsUrl: text("credentials_url").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", timestampConfig).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", timestampConfig).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("media_storage_profile_app_bucket_key").on(
      table.application,
      table.bucketName,
    ),
  ],
);

export const mediaBucket = pgTable(
  "media_bucket",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    application: varchar("application", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    bucketName: varchar("r2_bucket_name", { length: 255 }).notNull(),
    storagePrefix: text("storage_prefix").notNull(),
    visibility: mediaVisibility("visibility").notNull().default("private"),
    allowedTypes: mediaType("allowed_types").array().notNull(),
    maxFileSize: bigint("max_file_size", { mode: "number" }),
    lifecycle: jsonb("lifecycle").notNull().default(sql.raw("'{}'::jsonb")),
    metadata: jsonb("metadata").notNull().default(sql.raw("'{}'::jsonb")),
    createdAt: timestamp("created_at", timestampConfig).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", timestampConfig).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("media_bucket_application_name_key").on(
      table.application,
      table.name,
    ),
    uniqueIndex("media_bucket_r2_bucket_prefix_key").on(
      table.bucketName,
      table.storagePrefix,
    ),
  ],
);

export const mediaAsset = pgTable(
  "media_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    bucketId: uuid("bucket_id")
      .notNull()
      .references(() => mediaBucket.id, { onDelete: "restrict" }),
    application: varchar("application", { length: 64 }).notNull(),
    resourceType: varchar("resource_type", { length: 64 }),
    resourceId: text("resource_id"),
    type: mediaType("type").notNull(),
    status: mediaStatus("status").notNull().default("pending"),
    visibility: mediaVisibility("visibility").notNull().default("private"),
    objectKey: text("r2_key").notNull(),
    providerVersionId: text("r2_version_id"),
    deliveryPath: text("delivery_path").notNull(),
    publicUrl: text("public_url"),
    originalFilename: text("original_filename"),
    mimeType: varchar("mime_type", { length: 255 }),
    format: varchar("format", { length: 32 }),
    bytes: bigint("bytes", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    duration: numeric("duration", { precision: 14, scale: 3 }),
    pageCount: integer("page_count"),
    etag: text("etag"),
    checksum: text("checksum"),
    version: integer("version").notNull().default(1),
    metadata: jsonb("metadata").notNull().default(sql.raw("'{}'::jsonb")),
    providerMetadata: jsonb("provider_metadata")
      .notNull()
      .default(sql.raw("'{}'::jsonb")),
    createdAt: timestamp("created_at", timestampConfig).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", timestampConfig).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", timestampConfig),
  },
  (table) => [
    uniqueIndex("media_asset_r2_key_key").on(table.objectKey),
    uniqueIndex("media_asset_delivery_path_key").on(table.deliveryPath),
    index("media_asset_application_resource_idx").on(
      table.application,
      table.resourceType,
      table.resourceId,
    ),
    index("media_asset_owner_created_at_idx").on(
      table.ownerUserId,
      table.createdAt,
    ),
    index("media_asset_bucket_status_idx").on(table.bucketId, table.status),
    check(
      "media_asset_bytes_check",
      sql`${table.bytes} is null or ${table.bytes} >= 0`,
    ),
    check(
      "media_asset_width_check",
      sql`${table.width} is null or ${table.width} > 0`,
    ),
    check(
      "media_asset_height_check",
      sql`${table.height} is null or ${table.height} > 0`,
    ),
  ],
);

export const mediaVariant = pgTable(
  "media_variant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAsset.id, { onDelete: "cascade" }),
    kind: mediaVariantKind("kind").notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    objectKey: text("r2_key").notNull(),
    url: text("url").notNull(),
    format: varchar("format", { length: 32 }),
    bytes: bigint("bytes", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    duration: numeric("duration", { precision: 14, scale: 3 }),
    transformation: jsonb("transformation")
      .notNull()
      .default(sql.raw("'{}'::jsonb")),
    createdAt: timestamp("created_at", timestampConfig).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", timestampConfig).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("media_variant_asset_name_key").on(table.assetId, table.name),
    uniqueIndex("media_variant_r2_key_key").on(table.objectKey),
  ],
);

export const mediaUploadSession = pgTable(
  "media_upload_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    bucketId: uuid("bucket_id")
      .notNull()
      .references(() => mediaBucket.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").references(() => mediaAsset.id, {
      onDelete: "set null",
    }),
    objectKey: text("r2_key").notNull(),
    multipartUploadId: text("r2_upload_id"),
    status: mediaStatus("status").notNull().default("pending"),
    uploadParameters: jsonb("upload_parameters")
      .notNull()
      .default(sql.raw("'{}'::jsonb")),
    error: text("error"),
    expiresAt: timestamp("expires_at", timestampConfig).notNull(),
    completedAt: timestamp("completed_at", timestampConfig),
    createdAt: timestamp("created_at", timestampConfig).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("media_upload_session_r2_key_key").on(table.objectKey),
    index("media_upload_session_user_status_idx").on(
      table.userId,
      table.status,
    ),
  ],
);

export const mediaUploadPart = pgTable(
  "media_upload_part",
  {
    uploadSessionId: uuid("upload_session_id")
      .notNull()
      .references(() => mediaUploadSession.id, { onDelete: "cascade" }),
    partNumber: integer("part_number").notNull(),
    etag: text("etag").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    uploadedAt: timestamp("uploaded_at", timestampConfig)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.uploadSessionId, table.partNumber] }),
    check("media_upload_part_number_check", sql`${table.partNumber} > 0`),
    check("media_upload_part_bytes_check", sql`${table.bytes} > 0`),
  ],
);

export const mediaProcessingJob = pgTable(
  "media_processing_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAsset.id, { onDelete: "cascade" }),
    type: mediaJobType("type").notNull(),
    status: mediaStatus("status").notNull().default("pending"),
    input: jsonb("input").notNull().default(sql.raw("'{}'::jsonb")),
    output: jsonb("output").notNull().default(sql.raw("'{}'::jsonb")),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    error: text("error"),
    scheduledAt: timestamp("scheduled_at", timestampConfig)
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", timestampConfig),
    completedAt: timestamp("completed_at", timestampConfig),
    createdAt: timestamp("created_at", timestampConfig).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", timestampConfig).notNull().defaultNow(),
  },
  (table) => [
    index("media_processing_job_status_scheduled_at_idx").on(
      table.status,
      table.scheduledAt,
    ),
    index("media_processing_job_asset_id_idx").on(table.assetId),
  ],
);

export const mediaAccessGrant = pgTable(
  "media_access_grant",
  {
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAsset.id, { onDelete: "cascade" }),
    granteeType: varchar("grantee_type", { length: 32 }).notNull(),
    granteeId: text("grantee_id").notNull(),
    permission: mediaPermission("permission").notNull(),
    expiresAt: timestamp("expires_at", timestampConfig),
    createdAt: timestamp("created_at", timestampConfig).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.assetId,
        table.granteeType,
        table.granteeId,
        table.permission,
      ],
    }),
  ],
);

export const mediaSignedUrl = pgTable(
  "media_signed_url",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAsset.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    permission: mediaPermission("permission").notNull().default("view"),
    maxUses: integer("max_uses"),
    useCount: integer("use_count").notNull().default(0),
    expiresAt: timestamp("expires_at", timestampConfig).notNull(),
    revokedAt: timestamp("revoked_at", timestampConfig),
    createdAt: timestamp("created_at", timestampConfig).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("media_signed_url_token_hash_key").on(table.tokenHash),
    index("media_signed_url_asset_expires_at_idx").on(
      table.assetId,
      table.expiresAt,
    ),
    check("media_signed_url_use_count_check", sql`${table.useCount} >= 0`),
  ],
);

export const mediaAssetRelations = relations(mediaAsset, ({ many, one }) => ({
  owner: one(user, {
    fields: [mediaAsset.ownerUserId],
    references: [user.id],
  }),
  bucket: one(mediaBucket, {
    fields: [mediaAsset.bucketId],
    references: [mediaBucket.id],
  }),
  variants: many(mediaVariant),
  jobs: many(mediaProcessingJob),
  grants: many(mediaAccessGrant),
  signedUrls: many(mediaSignedUrl),
}));

export type User = typeof user.$inferSelect;
export type MediaBucket = typeof mediaBucket.$inferSelect;
export type MediaAsset = typeof mediaAsset.$inferSelect;
export type MediaVariant = typeof mediaVariant.$inferSelect;
export type MediaUploadSession = typeof mediaUploadSession.$inferSelect;
export type MediaUploadPart = typeof mediaUploadPart.$inferSelect;
export type MediaProcessingJob = typeof mediaProcessingJob.$inferSelect;
export type MediaAccessGrant = typeof mediaAccessGrant.$inferSelect;
export type MediaSignedUrl = typeof mediaSignedUrl.$inferSelect;
