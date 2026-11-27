import { and, count, desc, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { database } from "@/database";
import {
  mediaAccessGrant,
  mediaAsset,
  mediaBucket,
  mediaProcessingJob,
  mediaSignedUrl,
  mediaUploadPart,
  mediaUploadSession,
  mediaVariant,
} from "@/database/schema";
import { ServiceError } from "@/lib/errors";
import {
  abortMultipartUpload,
  beginMultipartUpload,
  completeMultipartUpload,
  createDownloadUrl,
  createMultipartPartUrl,
  createUploadUrl,
  deleteObject,
  headObject,
  headBucket,
  readObjectPrefix,
} from "@/lib/s3/client";
import {
  createDeliveryPath,
  createObjectKey,
  matchesImageSignature,
  isProcessingObjectKey,
} from "@/utils/media";
import type {
  AssetUrlInput,
  CompleteUploadInput,
  CreateBucketInput,
  CreateJobInput,
  CreateUploadInput,
  CreateVariantInput,
  GrantInput,
  CreateLinkInput,
  ListAssetInput,
  ListGrantInput,
  ListJobInput,
  ListLinkInput,
  ListVariantInput,
  UpdateAssetInput,
  UpdateBucketInput,
  UpdateJobInput,
  UpdateVariantInput,
  UploadPartInput,
} from "@/schemas/media";
import type { AuthContext } from "@/utils/interface";
import { processingPlan } from "@/lib/processing/ffmpeg";
import { matchesChatSignature } from "@/utils/chat-media";

function pagination<T>(
  data: T[],
  total: number,
  limit: number,
  offset: number,
) {
  return {
    data,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + data.length < total,
    },
  };
}

async function getBucket(id: string, auth: AuthContext) {
  const [bucket] = await database
    .select()
    .from(mediaBucket)
    .where(
      and(
        eq(mediaBucket.id, id),
        eq(mediaBucket.application, auth.application),
      ),
    )
    .limit(1);

  if (!bucket) throw new ServiceError("media_bucket_not_found", 404);
  return bucket;
}

async function getOwnedAsset(id: string, auth: AuthContext) {
  const [asset] = await database
    .select()
    .from(mediaAsset)
    .where(
      and(
        eq(mediaAsset.id, id),
        eq(mediaAsset.application, auth.application),
        eq(mediaAsset.ownerUserId, auth.user.id),
        isNull(mediaAsset.deletedAt),
      ),
    )
    .limit(1);

  if (!asset) throw new ServiceError("media_asset_not_found", 404);
  return asset;
}

async function getAccessibleAsset(
  id: string,
  auth: AuthContext,
  permission: "view" | "download" = "view",
) {
  const [asset] = await database
    .select()
    .from(mediaAsset)
    .where(
      and(
        eq(mediaAsset.id, id),
        eq(mediaAsset.application, auth.application),
        isNull(mediaAsset.deletedAt),
      ),
    )
    .limit(1);

  if (!asset) throw new ServiceError("media_asset_not_found", 404);
  if (asset.visibility !== "private" || asset.ownerUserId === auth.user.id) {
    return asset;
  }

  const [grant] = await database
    .select({ assetId: mediaAccessGrant.assetId })
    .from(mediaAccessGrant)
    .where(
      and(
        eq(mediaAccessGrant.assetId, asset.id),
        eq(mediaAccessGrant.granteeType, "user"),
        eq(mediaAccessGrant.granteeId, auth.user.externalUserId),
        or(
          eq(mediaAccessGrant.permission, permission),
          eq(mediaAccessGrant.permission, "manage"),
        ),
        or(
          isNull(mediaAccessGrant.expiresAt),
          gt(mediaAccessGrant.expiresAt, new Date()),
        ),
      ),
    )
    .limit(1);
  if (!grant) throw new ServiceError("media_access_denied", 403);
  return asset;
}

async function getAssetBucket(asset: typeof mediaAsset.$inferSelect) {
  const [bucket] = await database
    .select()
    .from(mediaBucket)
    .where(eq(mediaBucket.id, asset.bucketId))
    .limit(1);
  if (!bucket) throw new ServiceError("media_bucket_not_found", 404);
  return bucket;
}

export function rawListBuckets(auth: AuthContext) {
  return database
    .select()
    .from(mediaBucket)
    .where(eq(mediaBucket.application, auth.application))
    .orderBy(desc(mediaBucket.createdAt));
}

export function rawGetMediaBucket(id: string, auth: AuthContext) {
  return getBucket(id, auth);
}

export async function rawCreateBucket(
  input: CreateBucketInput,
  auth: AuthContext,
) {
  await headBucket(input.bucketName, auth.application);
  const [bucket] = await database
    .insert(mediaBucket)
    .values({
      application: auth.application,
      name: input.name,
      bucketName: input.bucketName,
      storagePrefix: input.storagePrefix,
      visibility: input.visibility,
      allowedTypes: input.allowedTypes,
      maxFileSize: input.maxFileSize ?? null,
      lifecycle: input.lifecycle,
      metadata: input.metadata,
    })
    .returning();
  if (!bucket) throw new ServiceError("media_bucket_create_failed", 409);
  return bucket;
}

export async function rawUpdateBucket(
  id: string,
  input: UpdateBucketInput,
  auth: AuthContext,
) {
  const [bucket] = await database
    .update(mediaBucket)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(
        eq(mediaBucket.id, id),
        eq(mediaBucket.application, auth.application),
      ),
    )
    .returning();
  if (!bucket) throw new ServiceError("media_bucket_not_found", 404);
  return bucket;
}

export async function rawDeleteBucket(id: string, auth: AuthContext) {
  await getBucket(id, auth);
  const [assetCount] = await database
    .select({ total: count() })
    .from(mediaAsset)
    .where(and(eq(mediaAsset.bucketId, id), isNull(mediaAsset.deletedAt)));
  if (Number(assetCount?.total ?? 0) > 0) {
    throw new ServiceError("media_bucket_not_empty", 409);
  }
  await database.delete(mediaBucket).where(eq(mediaBucket.id, id));
}

export async function rawListAssets(input: ListAssetInput, auth: AuthContext) {
  const filters = [
    eq(mediaAsset.application, auth.application),
    isNull(mediaAsset.deletedAt),
  ];
  if (input.bucket) filters.push(eq(mediaAsset.bucketId, input.bucket));
  if (input.resourceType)
    filters.push(eq(mediaAsset.resourceType, input.resourceType));
  if (input.resourceId)
    filters.push(eq(mediaAsset.resourceId, input.resourceId));
  if (input.type) filters.push(eq(mediaAsset.type, input.type));
  if (input.status) filters.push(eq(mediaAsset.status, input.status));
  if (input.visibility)
    filters.push(eq(mediaAsset.visibility, input.visibility));
  if (input.owner === "me") {
    filters.push(eq(mediaAsset.ownerUserId, auth.user.id));
  } else {
    filters.push(
      or(
        ne(mediaAsset.visibility, "private"),
        eq(mediaAsset.ownerUserId, auth.user.id),
      )!,
    );
  }

  const where = and(...filters);
  const [items, totals] = await Promise.all([
    database
      .select()
      .from(mediaAsset)
      .where(where)
      .orderBy(desc(mediaAsset.createdAt))
      .limit(input.limit)
      .offset(input.offset),
    database.select({ total: count() }).from(mediaAsset).where(where),
  ]);
  return pagination(
    items,
    Number(totals[0]?.total ?? 0),
    input.limit,
    input.offset,
  );
}

export async function rawGetAsset(id: string, auth: AuthContext) {
  const asset = await getAccessibleAsset(id, auth);
  const variants = await database
    .select()
    .from(mediaVariant)
    .where(eq(mediaVariant.assetId, asset.id));
  return { ...asset, variants };
}

export async function rawUpdateAsset(
  id: string,
  input: UpdateAssetInput,
  auth: AuthContext,
) {
  await getOwnedAsset(id, auth);
  const [asset] = await database
    .update(mediaAsset)
    .set({
      ...input,
      version: sql`${mediaAsset.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(mediaAsset.id, id))
    .returning();
  if (!asset) throw new ServiceError("media_asset_not_found", 404);
  return asset;
}

export async function rawDeleteAsset(id: string, auth: AuthContext) {
  const asset = await getOwnedAsset(id, auth);
  const bucket = await getAssetBucket(asset);
  const variants = await database
    .select({ key: mediaVariant.objectKey })
    .from(mediaVariant)
    .where(eq(mediaVariant.assetId, id));

  await Promise.all([
    deleteObject(bucket.bucketName, asset.objectKey, bucket.application),
    ...variants
      .filter((variant) => isProcessingObjectKey(asset.objectKey, variant.key))
      .map((variant) =>
        deleteObject(bucket.bucketName, variant.key, bucket.application),
      ),
  ]);

  await database
    .update(mediaAsset)
    .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(mediaAsset.id, id));
}

export async function rawGetAssetUrl(
  id: string,
  input: AssetUrlInput,
  auth: AuthContext,
) {
  const asset = await getAccessibleAsset(
    id,
    auth,
    input.download ? "download" : "view",
  );
  if (asset.status !== "ready") {
    throw new ServiceError("media_asset_not_ready", 409);
  }
  const bucket = await getAssetBucket(asset);
  return {
    url: await createDownloadUrl({
      application: bucket.application,
      bucket: bucket.bucketName,
      key: asset.objectKey,
      filename: input.download ? asset.originalFilename : null,
      expiresIn: input.expiresIn,
    }),
    expiresIn: input.expiresIn,
  };
}

export async function rawGetPublicAssetUrl(id: string) {
  const [asset] = await database
    .select()
    .from(mediaAsset)
    .where(
      and(
        eq(mediaAsset.id, id),
        eq(mediaAsset.visibility, "public"),
        eq(mediaAsset.status, "ready"),
        isNull(mediaAsset.deletedAt),
      ),
    )
    .limit(1);
  if (!asset) throw new ServiceError("media_asset_not_found", 404);
  const bucket = await getAssetBucket(asset);
  return createDownloadUrl({
    application: bucket.application,
    bucket: bucket.bucketName,
    key: asset.objectKey,
    filename: asset.originalFilename,
    expiresIn: 300,
  });
}

/** Task has already enforced its page ACL. This delegate can sign only Task page assets. */
export async function rawGetTaskAssetUrl(id: string, pageId: string) {
  const [asset] = await database
    .select()
    .from(mediaAsset)
    .where(
      and(
        eq(mediaAsset.id, id),
        eq(mediaAsset.application, "task"),
        eq(mediaAsset.resourceType, "page"),
        eq(mediaAsset.resourceId, pageId),
      ),
    )
    .limit(1);
  if (
    !asset ||
    asset.status !== "ready" ||
    asset.application !== "task" ||
    asset.resourceType !== "page" ||
    asset.resourceId !== pageId
  )
    throw new ServiceError("media_asset_not_found", 404);
  const bucket = await getAssetBucket(asset);
  if (bucket.application !== "task")
    throw new ServiceError("media_asset_not_found", 404);
  return {
    url: await createDownloadUrl({
      application: "task",
      bucket: bucket.bucketName,
      key: asset.objectKey,
      filename: asset.originalFilename,
      expiresIn: 60,
    }),
    expiresIn: 60,
  };
}

export async function rawCreateUpload(
  input: CreateUploadInput,
  auth: AuthContext,
) {
  const bucket = await getBucket(input.bucket, auth);
  if (
    auth.application === "video" &&
    input.resourceType === "video-content" &&
    (bucket.visibility !== "private" || input.visibility !== "private")
  )
    throw new ServiceError("video_private_bucket_required", 400);
  if (
    auth.application === "reader" &&
    (input.resourceType !== "reader-content" ||
      input.visibility !== "private" ||
      input.type !== "image" ||
      input.multipart ||
      input.size > 20 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(input.contentType))
  )
    throw new ServiceError("invalid_reader_upload", 400);
  if (
    auth.application === "sso" &&
    (bucket.name !== "avatar" ||
      input.type !== "image" ||
      input.resourceType !== "avatar" ||
      input.resourceId !== auth.user.externalUserId ||
      input.multipart ||
      input.visibility !== "public" ||
      input.size > 2_097_152 ||
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        input.contentType,
      ))
  ) {
    throw new ServiceError("invalid_avatar_upload", 400);
  }
  if (!bucket.allowedTypes.includes(input.type)) {
    throw new ServiceError("media_type_not_allowed", 400);
  }
  if (bucket.maxFileSize && input.size > bucket.maxFileSize) {
    throw new ServiceError("media_file_too_large", 400);
  }

  const key = createObjectKey({
    application: auth.application,
    prefix: bucket.storagePrefix,
    filename: input.filename,
  });
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const assetId = randomUUID();

  const [asset] = await database
    .insert(mediaAsset)
    .values({
      id: assetId,
      ownerUserId: auth.user.id,
      bucketId: bucket.id,
      application: auth.application,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      type: input.type,
      status: "uploading",
      visibility: input.visibility,
      objectKey: key,
      deliveryPath: createDeliveryPath(assetId),
      originalFilename: input.filename,
      mimeType: input.contentType,
      bytes: input.size,
      metadata: input.metadata,
      providerMetadata: { provider: "neon-object-storage" },
    })
    .returning();
  if (!asset) throw new ServiceError("media_asset_create_failed", 409);

  await database
    .update(mediaAsset)
    .set({ deliveryPath: createDeliveryPath(asset.id) })
    .where(eq(mediaAsset.id, asset.id));

  let multipartUploadId: string | undefined;
  try {
    const multipart = input.multipart
      ? await beginMultipartUpload({
          application: bucket.application,
          bucket: bucket.bucketName,
          key,
          contentType: input.contentType,
        })
      : undefined;
    multipartUploadId = multipart?.UploadId;
    if (input.multipart && !multipart?.UploadId) {
      throw new Error("multipart_upload_id_missing");
    }

    const [session] = await database
      .insert(mediaUploadSession)
      .values({
        userId: auth.user.id,
        bucketId: bucket.id,
        assetId: asset.id,
        objectKey: key,
        multipartUploadId: multipart?.UploadId ?? null,
        status: "uploading",
        uploadParameters: {
          contentType: input.contentType,
          size: input.size,
          multipart: input.multipart,
        },
        expiresAt,
      })
      .returning();
    if (!session) throw new Error("upload_session_create_failed");

    return {
      asset: { ...asset, deliveryPath: createDeliveryPath(asset.id) },
      upload: {
        id: session.id,
        method: input.multipart ? "MULTIPART" : "PUT",
        url: input.multipart
          ? null
          : await createUploadUrl({
              application: bucket.application,
              bucket: bucket.bucketName,
              key,
              contentType: input.contentType,
              expiresIn: input.resourceType === "avatar" ? 120 : 900,
              size: input.size,
            }),
        headers: input.multipart ? {} : { "Content-Type": input.contentType },
        expiresAt: expiresAt.toISOString(),
      },
    };
  } catch (error) {
    if (multipartUploadId) {
      try {
        await abortMultipartUpload({
          application: bucket.application,
          bucket: bucket.bucketName,
          key,
          uploadId: multipartUploadId,
        });
      } catch {
        console.error("[media-upload-cleanup]", {
          code: "multipart_abort_failed",
        });
      }
    }
    await database.transaction(async (transaction) => {
      await transaction
        .delete(mediaUploadSession)
        .where(eq(mediaUploadSession.assetId, asset.id));
      await transaction.delete(mediaAsset).where(eq(mediaAsset.id, asset.id));
    });
    throw error;
  }
}

async function getUploadSession(id: string, auth: AuthContext) {
  const [row] = await database
    .select({
      upload: mediaUploadSession,
      bucket: mediaBucket,
      asset: mediaAsset,
    })
    .from(mediaUploadSession)
    .innerJoin(mediaBucket, eq(mediaUploadSession.bucketId, mediaBucket.id))
    .innerJoin(mediaAsset, eq(mediaUploadSession.assetId, mediaAsset.id))
    .where(
      and(
        eq(mediaUploadSession.id, id),
        eq(mediaUploadSession.userId, auth.user.id),
        eq(mediaBucket.application, auth.application),
      ),
    )
    .limit(1);
  if (!row) throw new ServiceError("media_upload_not_found", 404);
  return row;
}

export async function rawGetUpload(id: string, auth: AuthContext) {
  const { upload, asset } = await getUploadSession(id, auth);
  return { ...upload, asset };
}

export async function rawCreateUploadPart(
  id: string,
  input: UploadPartInput,
  auth: AuthContext,
) {
  const { upload, bucket } = await getUploadSession(id, auth);
  if (!upload.multipartUploadId || upload.status !== "uploading") {
    throw new ServiceError("media_upload_not_multipart", 409);
  }
  if (upload.expiresAt.getTime() <= Date.now()) {
    throw new ServiceError("media_upload_expired", 409);
  }
  return {
    partNumber: input.partNumber,
    url: await createMultipartPartUrl({
      application: bucket.application,
      bucket: bucket.bucketName,
      key: upload.objectKey,
      uploadId: upload.multipartUploadId,
      partNumber: input.partNumber,
      expiresIn: input.expiresIn,
    }),
    expiresIn: input.expiresIn,
  };
}

export async function rawCompleteUpload(
  id: string,
  input: CompleteUploadInput,
  auth: AuthContext,
) {
  const { upload, bucket, asset } = await getUploadSession(id, auth);
  if (upload.status === "ready") return asset;
  if (upload.status !== "uploading") {
    throw new ServiceError("media_upload_not_active", 409);
  }
  if (upload.expiresAt.getTime() <= Date.now()) {
    throw new ServiceError("media_upload_expired", 409);
  }

  if (upload.multipartUploadId) {
    if (!input.parts?.length) {
      throw new ServiceError("media_upload_parts_required", 400);
    }
    const parts = [...input.parts].sort(
      (left, right) => left.partNumber - right.partNumber,
    );
    await completeMultipartUpload({
      application: bucket.application,
      bucket: bucket.bucketName,
      key: upload.objectKey,
      uploadId: upload.multipartUploadId,
      parts: parts.map((part) => ({
        ETag: part.etag,
        PartNumber: part.partNumber,
      })),
    });
    for (const part of parts) {
      await database
        .insert(mediaUploadPart)
        .values({
          uploadSessionId: upload.id,
          partNumber: part.partNumber,
          etag: part.etag,
          bytes: part.bytes ?? 1,
        })
        .onConflictDoUpdate({
          target: [mediaUploadPart.uploadSessionId, mediaUploadPart.partNumber],
          set: { etag: part.etag, bytes: part.bytes ?? 1 },
        });
    }
  }

  const object = await headObject(
    bucket.bucketName,
    upload.objectKey,
    bucket.application,
  );
  if (object.ContentType !== asset.mimeType)
    throw new ServiceError("media_upload_content_type_mismatch", 409);
  const contentLength = object.ContentLength;
  const expectedSize = (upload.uploadParameters as { size?: number }).size;
  if (expectedSize && contentLength !== expectedSize) {
    throw new ServiceError("media_upload_size_mismatch", 409);
  }
  if (
    asset.resourceType === "avatar" &&
    !matchesImageSignature(
      await readObjectPrefix(
        bucket.bucketName,
        upload.objectKey,
        bucket.application,
      ),
      asset.mimeType ?? "",
    )
  )
    throw new ServiceError("media_upload_content_invalid", 409);

  if (
    ((asset.application === "chat" && asset.resourceType === "conversation") ||
      (asset.application === "social" &&
        asset.resourceType === "social-content") ||
      (asset.application === "reader" &&
        asset.resourceType === "reader-content")) &&
    !matchesChatSignature(
      await readObjectPrefix(
        bucket.bucketName,
        upload.objectKey,
        bucket.application,
      ),
      asset.mimeType ?? "",
    )
  )
    throw new ServiceError("media_upload_content_invalid", 409);

  const now = new Date();
  const [ready] = await database.transaction(async (transaction) => {
    await transaction
      .update(mediaUploadSession)
      .set({ status: "ready", completedAt: now, error: null })
      .where(eq(mediaUploadSession.id, upload.id));
    if (
      asset.application === "social" &&
      asset.resourceType === "social-content"
    ) {
      await transaction
        .insert(mediaProcessingJob)
        .values({
          id: asset.id,
          assetId: asset.id,
          type: asset.type === "video" ? "transcode" : "optimize",
          input: {
            width: 1280,
            height: asset.type === "video" ? 720 : 1280,
            format: asset.type === "video" ? "mp4" : "webp",
          },
          maxAttempts: 3,
        })
        .onConflictDoNothing();
    }
    return transaction
      .update(mediaAsset)
      .set({
        status: "ready",
        bytes: contentLength ?? null,
        etag: object.ETag?.replaceAll('"', "") ?? null,
        providerVersionId: object.VersionId ?? null,
        providerMetadata: {
          provider: "neon-object-storage",
          storageClass: object.StorageClass,
        },
        updatedAt: now,
      })
      .where(eq(mediaAsset.id, asset.id))
      .returning();
  });
  if (!ready) throw new ServiceError("media_upload_complete_failed", 409);
  return ready;
}

export async function rawAbortUpload(id: string, auth: AuthContext) {
  const { upload, bucket, asset } = await getUploadSession(id, auth);
  if (upload.multipartUploadId) {
    await abortMultipartUpload({
      application: bucket.application,
      bucket: bucket.bucketName,
      key: upload.objectKey,
      uploadId: upload.multipartUploadId,
    });
  } else {
    await deleteObject(bucket.bucketName, upload.objectKey, bucket.application);
  }
  await database.transaction(async (transaction) => {
    await transaction
      .update(mediaUploadSession)
      .set({ status: "failed", error: "aborted" })
      .where(eq(mediaUploadSession.id, upload.id));
    await transaction
      .update(mediaAsset)
      .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(mediaAsset.id, asset.id));
  });
}

export async function rawListVariants(input: ListVariantInput, auth: AuthContext) {
  await getAccessibleAsset(input.asset, auth);
  const where = eq(mediaVariant.assetId, input.asset);
  const [items, totals] = await Promise.all([
    database
      .select()
      .from(mediaVariant)
      .where(where)
      .orderBy(desc(mediaVariant.createdAt))
      .limit(input.limit)
      .offset(input.offset),
    database.select({ total: count() }).from(mediaVariant).where(where),
  ]);
  return pagination(
    items,
    Number(totals[0]?.total ?? 0),
    input.limit,
    input.offset,
  );
}

export async function rawCreateVariant(
  input: CreateVariantInput,
  auth: AuthContext,
) {
  const asset = await getOwnedAsset(input.asset, auth);
  if (!isProcessingObjectKey(asset.objectKey, input.key))
    throw new ServiceError("variant_key_outside_asset", 400);
  const [variant] = await database
    .insert(mediaVariant)
    .values({
      assetId: input.asset,
      kind: input.kind,
      name: input.name,
      objectKey: input.key,
      url: input.url,
      format: input.format ?? null,
      bytes: input.bytes ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      duration: input.duration?.toString() ?? null,
      transformation: input.transformation,
    })
    .returning();
  if (!variant) throw new ServiceError("media_variant_create_failed", 409);
  return variant;
}

export async function rawGetVariant(id: string, auth: AuthContext) {
  const [variant] = await database
    .select()
    .from(mediaVariant)
    .where(eq(mediaVariant.id, id))
    .limit(1);
  if (!variant) throw new ServiceError("media_variant_not_found", 404);
  await getAccessibleAsset(variant.assetId, auth);
  return variant;
}

export async function rawUpdateVariant(
  id: string,
  input: UpdateVariantInput,
  auth: AuthContext,
) {
  const [existing] = await database
    .select({ assetId: mediaVariant.assetId })
    .from(mediaVariant)
    .where(eq(mediaVariant.id, id))
    .limit(1);
  if (!existing) throw new ServiceError("media_variant_not_found", 404);
  const asset = await getOwnedAsset(existing.assetId, auth);
  if (input.key && !isProcessingObjectKey(asset.objectKey, input.key))
    throw new ServiceError("variant_key_outside_asset", 400);
  const { key, duration, ...rest } = input;
  const [variant] = await database
    .update(mediaVariant)
    .set({
      ...rest,
      objectKey: key,
      duration: duration?.toString(),
      updatedAt: new Date(),
    })
    .where(eq(mediaVariant.id, id))
    .returning();
  return variant;
}

export async function rawDeleteVariant(id: string, auth: AuthContext) {
  const [variant] = await database
    .select()
    .from(mediaVariant)
    .where(eq(mediaVariant.id, id))
    .limit(1);
  if (!variant) throw new ServiceError("media_variant_not_found", 404);
  const asset = await getOwnedAsset(variant.assetId, auth);
  const bucket = await getAssetBucket(asset);
  // Legacy invalid metadata may be removed, but never delete its foreign object.
  if (isProcessingObjectKey(asset.objectKey, variant.objectKey))
    await deleteObject(
      bucket.bucketName,
      variant.objectKey,
      bucket.application,
    );
  await database.delete(mediaVariant).where(eq(mediaVariant.id, id));
}

export async function rawListJobs(input: ListJobInput, auth: AuthContext) {
  const filters = [
    eq(mediaAsset.application, auth.application),
    eq(mediaAsset.ownerUserId, auth.user.id),
    isNull(mediaAsset.deletedAt),
  ];
  if (input.asset) {
    await getOwnedAsset(input.asset, auth);
    filters.push(eq(mediaProcessingJob.assetId, input.asset));
  }
  if (input.status) filters.push(eq(mediaProcessingJob.status, input.status));
  const where = and(...filters);
  const [rows, totals] = await Promise.all([
    database
      .select({ job: mediaProcessingJob })
      .from(mediaProcessingJob)
      .innerJoin(mediaAsset, eq(mediaProcessingJob.assetId, mediaAsset.id))
      .where(where)
      .orderBy(desc(mediaProcessingJob.createdAt))
      .limit(input.limit)
      .offset(input.offset),
    database
      .select({ total: count() })
      .from(mediaProcessingJob)
      .innerJoin(mediaAsset, eq(mediaProcessingJob.assetId, mediaAsset.id))
      .where(where),
  ]);
  const items = rows.map(({ job }) => job);
  return pagination(
    items,
    Number(totals[0]?.total ?? 0),
    input.limit,
    input.offset,
  );
}

export async function rawCreateJob(input: CreateJobInput, auth: AuthContext) {
  const asset = await getOwnedAsset(input.asset, auth);
  if (asset.status !== "ready")
    throw new ServiceError("media_asset_not_ready", 409);
  try {
    processingPlan(input.type, asset.type, input.input);
  } catch {
    throw new ServiceError("invalid_processing_request", 400);
  }
  const [job] = await database
    .insert(mediaProcessingJob)
    .values({
      assetId: input.asset,
      type: input.type,
      input: input.input,
      maxAttempts: input.maxAttempts,
    })
    .returning();
  if (!job) throw new ServiceError("media_job_create_failed", 409);
  return job;
}

export async function rawGetJob(id: string, auth: AuthContext) {
  const [job] = await database
    .select()
    .from(mediaProcessingJob)
    .where(eq(mediaProcessingJob.id, id))
    .limit(1);
  if (!job) throw new ServiceError("media_job_not_found", 404);
  await getOwnedAsset(job.assetId, auth);
  return job;
}

export async function rawUpdateJob(
  id: string,
  input: UpdateJobInput,
  auth: AuthContext,
) {
  const [existing] = await database
    .select()
    .from(mediaProcessingJob)
    .where(eq(mediaProcessingJob.id, id))
    .limit(1);
  if (!existing) throw new ServiceError("media_job_not_found", 404);
  await getOwnedAsset(existing.assetId, auth);
  // Completion is worker-owned. An API caller may only requeue an exhausted job.
  if (input.status !== "pending" || existing.status !== "failed")
    throw new ServiceError("media_job_worker_owned", 409);
  const now = new Date();
  const [job] = await database
    .update(mediaProcessingJob)
    .set({
      status: "pending",
      error: null,
      scheduledAt: now,
      startedAt: null,
      completedAt: null,
      maxAttempts: existing.attemptCount + 3,
      updatedAt: now,
    })
    .where(
      and(
        eq(mediaProcessingJob.id, id),
        eq(mediaProcessingJob.status, "failed"),
      ),
    )
    .returning();
  if (!job) throw new ServiceError("media_job_state_changed", 409);
  return job;
}

export async function rawGetVariantUrl(id: string, auth: AuthContext) {
  const [variant] = await database
    .select()
    .from(mediaVariant)
    .where(eq(mediaVariant.id, id))
    .limit(1);
  if (!variant) throw new ServiceError("media_variant_not_found", 404);
  const asset = await getAccessibleAsset(variant.assetId, auth);
  if (!isProcessingObjectKey(asset.objectKey, variant.objectKey))
    throw new ServiceError("variant_key_outside_asset", 403);
  const bucket = await getBucket(asset.bucketId, auth);
  return {
    url: await createDownloadUrl({
      application: asset.application,
      bucket: bucket.bucketName,
      key: variant.objectKey,
      expiresIn: 900,
    }),
  };
}

export async function rawListGrants(input: ListGrantInput, auth: AuthContext) {
  await getOwnedAsset(input.asset, auth);
  const where = eq(mediaAccessGrant.assetId, input.asset);
  const [items, totals] = await Promise.all([
    database
      .select()
      .from(mediaAccessGrant)
      .where(where)
      .orderBy(desc(mediaAccessGrant.createdAt))
      .limit(input.limit)
      .offset(input.offset),
    database.select({ total: count() }).from(mediaAccessGrant).where(where),
  ]);
  return pagination(
    items,
    Number(totals[0]?.total ?? 0),
    input.limit,
    input.offset,
  );
}

export async function rawUpsertGrant(input: GrantInput, auth: AuthContext) {
  await getOwnedAsset(input.asset, auth);
  const [grant] = await database
    .insert(mediaAccessGrant)
    .values({
      assetId: input.asset,
      granteeType: input.granteeType,
      granteeId: input.granteeId,
      permission: input.permission,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    })
    .onConflictDoUpdate({
      target: [
        mediaAccessGrant.assetId,
        mediaAccessGrant.granteeType,
        mediaAccessGrant.granteeId,
        mediaAccessGrant.permission,
      ],
      set: { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null },
    })
    .returning();
  return grant;
}

export async function rawDeleteGrant(input: GrantInput, auth: AuthContext) {
  await getOwnedAsset(input.asset, auth);
  const [grant] = await database
    .delete(mediaAccessGrant)
    .where(
      and(
        eq(mediaAccessGrant.assetId, input.asset),
        eq(mediaAccessGrant.granteeType, input.granteeType),
        eq(mediaAccessGrant.granteeId, input.granteeId),
        eq(mediaAccessGrant.permission, input.permission),
      ),
    )
    .returning();
  if (!grant) throw new ServiceError("media_grant_not_found", 404);
}

function hashLinkToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function rawListLinks(input: ListLinkInput, auth: AuthContext) {
  await getOwnedAsset(input.asset, auth);
  const where = eq(mediaSignedUrl.assetId, input.asset);
  const [items, totals] = await Promise.all([
    database
      .select({
        id: mediaSignedUrl.id,
        assetId: mediaSignedUrl.assetId,
        permission: mediaSignedUrl.permission,
        maxUses: mediaSignedUrl.maxUses,
        useCount: mediaSignedUrl.useCount,
        expiresAt: mediaSignedUrl.expiresAt,
        revokedAt: mediaSignedUrl.revokedAt,
        createdAt: mediaSignedUrl.createdAt,
      })
      .from(mediaSignedUrl)
      .where(where)
      .orderBy(desc(mediaSignedUrl.createdAt))
      .limit(input.limit)
      .offset(input.offset),
    database.select({ total: count() }).from(mediaSignedUrl).where(where),
  ]);
  return pagination(
    items,
    Number(totals[0]?.total ?? 0),
    input.limit,
    input.offset,
  );
}

export async function rawCreateLink(input: CreateLinkInput, auth: AuthContext) {
  await getOwnedAsset(input.asset, auth);
  const token = randomBytes(32).toString("base64url");
  const [link] = await database
    .insert(mediaSignedUrl)
    .values({
      assetId: input.asset,
      tokenHash: hashLinkToken(token),
      permission: input.permission,
      maxUses: input.maxUses ?? null,
      expiresAt: new Date(Date.now() + input.expiresIn * 1000),
    })
    .returning({
      id: mediaSignedUrl.id,
      expiresAt: mediaSignedUrl.expiresAt,
    });
  if (!link) throw new ServiceError("media_link_create_failed", 409);
  return {
    ...link,
    url: `/media/link/${encodeURIComponent(token)}`,
  };
}

export async function rawResolveLink(token: string) {
  const now = new Date();
  const [link] = await database
    .update(mediaSignedUrl)
    .set({ useCount: sql`${mediaSignedUrl.useCount} + 1` })
    .where(
      and(
        eq(mediaSignedUrl.tokenHash, hashLinkToken(token)),
        isNull(mediaSignedUrl.revokedAt),
        gt(mediaSignedUrl.expiresAt, now),
        or(
          isNull(mediaSignedUrl.maxUses),
          lt(mediaSignedUrl.useCount, mediaSignedUrl.maxUses),
        ),
      ),
    )
    .returning();
  if (!link) throw new ServiceError("media_link_invalid", 404);

  const [asset] = await database
    .select()
    .from(mediaAsset)
    .where(
      and(
        eq(mediaAsset.id, link.assetId),
        eq(mediaAsset.status, "ready"),
        isNull(mediaAsset.deletedAt),
      ),
    )
    .limit(1);
  if (!asset) throw new ServiceError("media_asset_not_found", 404);
  const bucket = await getAssetBucket(asset);
  return createDownloadUrl({
    application: bucket.application,
    bucket: bucket.bucketName,
    key: asset.objectKey,
    filename: link.permission === "download" ? asset.originalFilename : null,
    expiresIn: 60,
  });
}

export async function rawRevokeLink(id: string, auth: AuthContext) {
  const [link] = await database
    .select({ assetId: mediaSignedUrl.assetId })
    .from(mediaSignedUrl)
    .where(eq(mediaSignedUrl.id, id))
    .limit(1);
  if (!link) throw new ServiceError("media_link_not_found", 404);
  await getOwnedAsset(link.assetId, auth);
  await database
    .update(mediaSignedUrl)
    .set({ revokedAt: new Date() })
    .where(eq(mediaSignedUrl.id, id));
}
