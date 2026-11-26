import { pool } from "@/database";
import { ServiceError } from "@/lib/errors";
import { createDownloadUrl } from "@/lib/s3/client";
const videoPreset = `input->>'width'='1280' AND input->>'height'='720' AND input->>'second'='0' AND ((type='transcode' AND input->>'format'='mp4') OR (type='thumbnail' AND input->>'format'='webp'))`;
export async function rawGetVideoAsset(
  assetId: string,
  owner: string,
  videoId: string,
) {
  const { rows } = await pool.query(
    `SELECT a.*,b.r2_bucket_name AS bucket_name FROM media_asset a
    JOIN media_bucket b ON b.id=a.bucket_id JOIN "user" u ON u.id=a.owner_user_id
    WHERE a.id=$1 AND u.external_user_id=$2 AND a.resource_id=$3 AND a.application='video' AND b.application='video' AND b.visibility='private' AND u.status='active' AND u.deleted_at IS NULL
    AND a.resource_type='video-content' AND a.visibility='private' AND a.type='video'
    AND a.status='ready' AND a.deleted_at IS NULL`,
    [assetId, owner, videoId],
  );
  const asset = rows[0];
  if (
    !asset ||
    !["video/mp4", "video/webm", "video/quicktime"].includes(asset.mime_type) ||
    Number(asset.bytes) <= 0 ||
    Number(asset.bytes) > 512 * 1024 * 1024
  )
    throw new ServiceError("video_asset_not_found", 404);
  return asset;
}
export async function rawPrepareVideoAsset(
  assetId: string,
  owner: string,
  videoId: string,
) {
  await rawGetVideoAsset(assetId, owner, videoId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM media_asset WHERE id=$1 FOR UPDATE", [
      assetId,
    ]);
    await client.query(
      `UPDATE media_processing_job SET status='pending',max_attempts=6,scheduled_at=now(),updated_at=now()
      WHERE asset_id=$1 AND ${videoPreset} AND status='failed' AND attempt_count<6`,
      [assetId],
    );
    for (const type of ["transcode", "thumbnail"]) {
      await client.query(
        `INSERT INTO media_processing_job(id,asset_id,type,input)
        SELECT $1,$2,$3,$4 WHERE NOT EXISTS(SELECT 1 FROM media_processing_job
          WHERE asset_id=$2 AND type=$3 AND ${videoPreset})`,
        [
          crypto.randomUUID(),
          assetId,
          type,
          JSON.stringify({
            width: 1280,
            height: 720,
            second: 0,
            format: type === "transcode" ? "mp4" : "webp",
          }),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return rawInspectVideoAsset(assetId, owner, videoId);
}
export async function rawInspectVideoAsset(
  assetId: string,
  owner: string,
  videoId: string,
) {
  const asset = await rawGetVideoAsset(assetId, owner, videoId);
  const { rows } = await pool.query(
    `SELECT DISTINCT ON(type) id,type,status,output,error FROM media_processing_job
    WHERE asset_id=$1 AND ${videoPreset} ORDER BY type,created_at DESC,id DESC`,
    [assetId],
  );
  const video = rows.find((j) => j.type === "transcode");
  return {
    assetId: asset.id,
    resourceId: asset.resource_id,
    filename: asset.original_filename,
    status:
      rows.filter((j) => ["transcode", "thumbnail"].includes(j.type)).length ===
        2 &&
      rows
        .filter((j) => ["transcode", "thumbnail"].includes(j.type))
        .every((j) => j.status === "ready")
        ? "ready"
        : rows.some((j) => j.status === "failed")
          ? "failed"
          : "processing",
    duration: Number(video?.output?.duration ?? 0),
    jobs: rows.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      error: j.error,
    })),
  };
}
export async function rawGetVideoAssetUrl(
  assetId: string,
  owner: string,
  kind: string,
  videoId: string,
) {
  const asset = await rawGetVideoAsset(assetId, owner, videoId);
  const state = await rawInspectVideoAsset(assetId, owner, videoId);
  if (state.status !== "ready") throw new ServiceError("video_processing", 409);
  const { rows } = await pool.query(
    `SELECT v.*,j.id AS job_id FROM media_variant v JOIN media_processing_job j
    ON v.id::text=j.output->>'variantId' AND v.asset_id=j.asset_id
    WHERE j.asset_id=$1 AND j.type=$2 AND j.status='ready' AND ${videoPreset}
    ORDER BY j.created_at DESC LIMIT 1`,
    [assetId, kind],
  );
  if (!rows[0]) throw new ServiceError("video_variant_not_found", 404);
  if (
    rows[0].r2_key !==
    `${asset.r2_key}.variant/${rows[0].job_id}.${kind === "thumbnail" ? "webp" : "mp4"}`
  )
    throw new ServiceError("invalid_video_variant", 403);
  return {
    url: await createDownloadUrl({
      application: "video",
      bucket: asset.bucket_name,
      key: rows[0].r2_key,
      filename: kind === "thumbnail" ? "thumbnail.webp" : "video.mp4",
      expiresIn: 120,
    }),
    expiresIn: 120,
    contentType: kind === "thumbnail" ? "image/webp" : "video/mp4",
  };
}
