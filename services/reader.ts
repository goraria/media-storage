import { and, eq, isNull } from "drizzle-orm";
import { database } from "@/database";
import { mediaAsset, mediaBucket, user } from "@/database/schema";
import { ServiceError } from "@/lib/errors";
import { createDownloadUrl } from "@/lib/s3/client";
export async function rawGetReaderAsset(
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
        eq(mediaAsset.application, "reader"),
        eq(mediaAsset.resourceType, "reader-content"),
        isNull(mediaAsset.deletedAt),
      ),
    )
    .limit(1);
  if (
    !row ||
    row.asset.status !== "ready" ||
    row.asset.deletedAt ||
    row.asset.visibility !== "private" ||
    row.bucket.application !== "reader" ||
    (ownerExternalUserId !== undefined &&
      row.owner.externalUserId !== ownerExternalUserId)
  )
    throw new ServiceError("media_asset_not_found", 404);
  return row;
}
export async function rawInspectReaderAsset(
  assetId: string,
  ownerExternalUserId: string,
) {
  const { asset } = await rawGetReaderAsset(assetId, ownerExternalUserId);
  return {
    id: asset.id,
    filename: asset.originalFilename,
    contentType: asset.mimeType,
    size: Number(asset.bytes),
  };
}
export async function rawGetReaderAssetUrl(assetId: string) {
  const { asset, bucket } = await rawGetReaderAsset(assetId);
  return {
    url: await createDownloadUrl({
      application: "reader",
      bucket: bucket.bucketName,
      key: asset.objectKey,
      filename: asset.originalFilename,
      expiresIn: 60,
    }),
    expiresIn: 60,
  };
}
