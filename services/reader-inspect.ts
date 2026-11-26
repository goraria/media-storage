import { and, eq, inArray, isNull } from "drizzle-orm";
import { database } from "@/database";
import { mediaAsset, mediaBucket, user } from "@/database/schema";
import { ServiceError } from "@/lib/errors";
export async function rawInspectReaderAssets(ids: string[], owner?: string) {
  const rows = await database
    .select({
      id: mediaAsset.id,
      contentType: mediaAsset.mimeType,
      size: mediaAsset.bytes,
      subject: user.externalUserId,
    })
    .from(mediaAsset)
    .innerJoin(mediaBucket, eq(mediaBucket.id, mediaAsset.bucketId))
    .innerJoin(user, eq(user.id, mediaAsset.ownerUserId))
    .where(
      and(
        inArray(mediaAsset.id, ids),
        eq(mediaAsset.application, "reader"),
        eq(mediaBucket.application, "reader"),
        eq(mediaAsset.resourceType, "reader-content"),
        eq(mediaAsset.status, "ready"),
        eq(mediaAsset.visibility, "private"),
        isNull(mediaAsset.deletedAt),
        ...(owner ? [eq(user.externalUserId, owner)] : []),
      ),
    );
  if (
    rows.length !== ids.length ||
    new Set(ids).size !== ids.length ||
    rows.some(
      (r) =>
        !["image/png", "image/jpeg", "image/webp"].includes(
          String(r.contentType),
        ) ||
        Number(r.size) <= 0 ||
        Number(r.size) > 20 * 1024 * 1024,
    )
  )
    throw new ServiceError("invalid_reader_asset", 403);
  return {
    data: rows.map((r) => ({
      id: r.id,
      contentType: r.contentType,
      size: Number(r.size),
    })),
  };
}
