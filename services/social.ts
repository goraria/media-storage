import { and, eq, isNull } from "drizzle-orm";
import { database, pool } from "@/database";
import { mediaAsset, mediaBucket, user } from "@/database/schema";
import { ServiceError } from "@/lib/errors";
import { createDownloadUrl } from "@/lib/s3/client";
import { isProcessingObjectKey } from "@/utils/media";
export async function rawGetSocialAsset(
  assetId: string,
  ownerExternalUserId?: string,
) {
  const [row] = await database
    .select({ asset: mediaAsset, bucket: mediaBucket, owner: user })
    .from(mediaAsset)
    .innerJoin(mediaBucket, eq(mediaBucket.id, mediaAsset.bucketId))
    .innerJoin(user, eq(user.id, mediaAsset.ownerUserId))
    .where(
      and(
        eq(mediaAsset.id, assetId),
        eq(mediaAsset.application, "social"),
        eq(mediaAsset.resourceType, "social-content"),
        isNull(mediaAsset.deletedAt),
      ),
    )
    .limit(1);
  if (
    !row ||
    row.asset.status !== "ready" ||
    row.asset.deletedAt ||
    row.asset.visibility !== "private" ||
    row.bucket.application !== "social" ||
    (ownerExternalUserId !== undefined &&
      row.owner.externalUserId !== ownerExternalUserId)
  )
    throw new ServiceError("media_asset_not_found", 404);
  return row;
}
export async function rawInspectSocialAsset(
  assetId: string,
  ownerExternalUserId: string,
) {
  const { asset } = await rawGetSocialAsset(assetId, ownerExternalUserId);
  return {
    id: asset.id,
    filename: asset.originalFilename,
    contentType: asset.mimeType,
    size: Number(asset.bytes),
  };
}
export async function rawGetSocialAssetUrl(assetId: string) {
  const { asset, bucket } = await rawGetSocialAsset(assetId);
  const variants = await pool.query(
    `SELECT v.r2_key FROM media_variant v JOIN media_processing_job j ON j.id=$1 AND j.asset_id=v.asset_id WHERE v.asset_id=$1 AND j.status='ready' AND v.name='job-'||j.id::text LIMIT 1`,
    [assetId],
  );
  const candidate = variants.rows[0]?.r2_key;
  const key =
    typeof candidate === "string" &&
    isProcessingObjectKey(asset.objectKey, candidate)
      ? candidate
      : asset.objectKey;
  return {
    url: await createDownloadUrl({
      application: "social",
      bucket: bucket.bucketName,
      key,
      filename: asset.originalFilename,
      expiresIn: 60,
    }),
    expiresIn: 60,
  };
}
