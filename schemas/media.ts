import { z } from "zod";

const identifier = z.string().trim().min(1).max(255);
const uuid = z.uuid();
const metadata = z.record(z.string(), z.unknown()).default({});

export const mediaTypeSchema = z.enum([
  "image",
  "video",
  "audio",
  "document",
  "attachment",
]);
export const mediaVisibilitySchema = z.enum(["private", "unlisted", "public"]);
export const mediaStatusSchema = z.enum([
  "pending",
  "uploading",
  "processing",
  "ready",
  "failed",
  "deleted",
]);
export const mediaVariantKindSchema = z.enum([
  "original",
  "optimized",
  "thumbnail",
  "preview",
  "transcode",
  "adaptive_stream",
  "document_preview",
  "extracted_text",
]);
export const mediaJobTypeSchema = z.enum([
  "resize",
  "crop",
  "optimize",
  "transcode",
  "thumbnail",
  "preview",
  "convert",
  "extract",
]);
export const mediaPermissionSchema = z.enum(["view", "download", "manage"]);

export const idParamsSchema = z.object({ id: uuid });
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createBucketSchema = z.object({
  name: z.string().trim().min(1).max(128),
  bucketName: z.string().trim().min(3).max(255),
  storagePrefix: z.string().trim().max(512).default("media"),
  visibility: mediaVisibilitySchema.default("private"),
  allowedTypes: z.array(mediaTypeSchema).min(1),
  maxFileSize: z.number().int().positive().nullable().optional(),
  lifecycle: metadata,
  metadata,
});
export const updateBucketSchema = createBucketSchema
  .omit({ bucketName: true })
  .partial();

export const listAssetSchema = paginationSchema.extend({
  bucket: uuid.optional(),
  resourceType: identifier.optional(),
  resourceId: identifier.optional(),
  type: mediaTypeSchema.optional(),
  status: mediaStatusSchema.optional(),
  visibility: mediaVisibilitySchema.optional(),
  owner: z.enum(["me", "any"]).default("any"),
});
export const updateAssetSchema = z.object({
  resourceType: identifier.nullable().optional(),
  resourceId: identifier.nullable().optional(),
  visibility: mediaVisibilitySchema.optional(),
  originalFilename: z.string().trim().min(1).max(512).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export const assetUrlSchema = z.object({
  expiresIn: z.coerce.number().int().min(60).max(3600).default(900),
  download: z.coerce.boolean().default(false),
});

export const createUploadSchema = z.object({
  bucket: uuid,
  filename: z.string().trim().min(1).max(512),
  contentType: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  type: mediaTypeSchema,
  visibility: mediaVisibilitySchema.default("private"),
  resourceType: identifier.nullable().optional(),
  resourceId: identifier.nullable().optional(),
  metadata,
  multipart: z.boolean().default(false),
});
export const uploadPartSchema = z.object({
  partNumber: z.number().int().min(1).max(10_000),
  expiresIn: z.number().int().min(60).max(3600).default(900),
});
export const completeUploadSchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10_000),
        etag: z.string().trim().min(1),
        bytes: z.number().int().positive().optional(),
      }),
    )
    .optional(),
});

export const listVariantSchema = paginationSchema.extend({ asset: uuid });
export const createVariantSchema = z.object({
  asset: uuid,
  kind: mediaVariantKindSchema,
  name: z.string().trim().min(1).max(128),
  key: z.string().trim().min(1),
  url: z.url(),
  format: z.string().trim().max(32).nullable().optional(),
  bytes: z.number().int().nonnegative().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  duration: z.number().nonnegative().nullable().optional(),
  transformation: metadata,
});
export const updateVariantSchema = createVariantSchema
  .omit({ asset: true })
  .partial();

export const listJobSchema = paginationSchema.extend({
  asset: uuid.optional(),
  status: mediaStatusSchema.optional(),
});
export const createJobSchema = z.object({
  asset: uuid,
  type: mediaJobTypeSchema,
  input: metadata,
  maxAttempts: z.number().int().min(1).max(10).default(3),
});
export const updateJobSchema = z.object({
  status: mediaStatusSchema,
  output: z.record(z.string(), z.unknown()).optional(),
  error: z.string().nullable().optional(),
});

export const listGrantSchema = paginationSchema.extend({ asset: uuid });
export const grantSchema = z.object({
  asset: uuid,
  granteeType: z.string().trim().min(1).max(32),
  granteeId: identifier,
  permission: mediaPermissionSchema,
  expiresAt: z.iso.datetime().nullable().optional(),
});

export const listLinkSchema = paginationSchema.extend({ asset: uuid });
export const createLinkSchema = z.object({
  asset: uuid,
  permission: z.enum(["view", "download"]).default("view"),
  expiresIn: z.number().int().min(60).max(604_800).default(900),
  maxUses: z.number().int().positive().nullable().optional(),
});
export const tokenParamsSchema = z.object({
  token: z.string().trim().min(32).max(256),
});

export type CreateBucketInput = z.infer<typeof createBucketSchema>;
export type UpdateBucketInput = z.infer<typeof updateBucketSchema>;
export type ListAssetInput = z.infer<typeof listAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type AssetUrlInput = z.infer<typeof assetUrlSchema>;
export type CreateUploadInput = z.infer<typeof createUploadSchema>;
export type UploadPartInput = z.infer<typeof uploadPartSchema>;
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;
export type ListVariantInput = z.infer<typeof listVariantSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type ListJobInput = z.infer<typeof listJobSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type ListGrantInput = z.infer<typeof listGrantSchema>;
export type GrantInput = z.infer<typeof grantSchema>;
export type ListLinkInput = z.infer<typeof listLinkSchema>;
export type CreateLinkInput = z.infer<typeof createLinkSchema>;
