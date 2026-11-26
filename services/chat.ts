import { and, eq } from "drizzle-orm";
import { database } from "@/database";
import { mediaAsset, mediaBucket, user } from "@/database/schema";
import { ServiceError } from "@/lib/errors";
import { createDownloadUrl } from "@/lib/s3/client";

export async function rawGetChatAsset(
  assetId: string,
  conversationId: string,
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
        eq(mediaAsset.application, "chat"),
        eq(mediaAsset.resourceType, "conversation"),
        eq(mediaAsset.resourceId, conversationId),
      ),
    )
    .limit(1);
  if (
    !row ||
    row.asset.status !== "ready" ||
    row.asset.visibility !== "private" ||
    row.bucket.application !== "chat" ||
    (ownerExternalUserId !== undefined &&
      row.owner.externalUserId !== ownerExternalUserId)
  )
    throw new ServiceError("media_asset_not_found", 404);
  return row;
}
export async function rawInspectChatAsset(
  assetId: string,
  conversationId: string,
  ownerExternalUserId: string,
) {
  const { asset } = await rawGetChatAsset(
    assetId,
    conversationId,
    ownerExternalUserId,
  );
  return {
    id: asset.id,
    filename: asset.originalFilename,
    contentType: asset.mimeType,
    size: Number(asset.bytes),
  };
}
export async function rawGetChatAssetUrl(assetId: string, conversationId: string) {
  const { asset, bucket } = await rawGetChatAsset(assetId, conversationId);
  return {
    url: await createDownloadUrl({
      application: "chat",
      bucket: bucket.bucketName,
      key: asset.objectKey,
      filename: asset.originalFilename,
      expiresIn: 60,
    }),
    expiresIn: 60,
  };
}
