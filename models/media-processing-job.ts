import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pool } from "@/database";
import {
  processingPlan,
  processFile,
  probeVideo,
} from "@/lib/processing/ffmpeg";
import {
  downloadProcessingObject,
  uploadProcessingObject,
} from "@/lib/s3/client";

/** One job per managed Queue invocation, with durable lease and attempt fencing. */
export async function rawProcessNextJob() {
  // Recover crashes; timeout is longer than bounded download+transcode+upload.
  await pool.query(`UPDATE media_processing_job SET status=CASE WHEN attempt_count>=max_attempts THEN 'failed'::media_status ELSE 'pending'::media_status END,
    error='worker_lease_expired',updated_at=now() WHERE status='processing' AND updated_at < now()-interval '10 minutes'`);
  const claimed =
    await pool.query(`UPDATE media_processing_job SET status='processing',attempt_count=attempt_count+1,started_at=now(),updated_at=now()
    WHERE id=(SELECT id FROM media_processing_job WHERE status='pending' AND scheduled_at<=now() AND attempt_count<max_attempts
      ORDER BY scheduled_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
  const job = claimed.rows[0];
  if (!job) return { processed: 0 };
  const directory = await mkdtemp(join(tmpdir(), "gorth-media-"));
  try {
    const { rows } = await pool.query(
      `SELECT a.*, b.r2_bucket_name AS bucket_name FROM media_asset a JOIN media_bucket b ON b.id=a.bucket_id
      WHERE a.id=$1 AND a.deleted_at IS NULL AND a.status='ready'`,
      [job.asset_id],
    );
    const asset = rows[0];
    if (!asset) throw new Error("asset_not_ready");
    const plan = processingPlan(job.type, asset.type, job.input);
    const source = join(directory, "source");
    const destination = join(directory, `result.${plan.format}`);
    await downloadProcessingObject(
      asset.application,
      asset.bucket_name,
      asset.r2_key,
      source,
    );
    // Video publishing accepts measured metadata only. Other applications keep their existing pipeline.
    let measured =
      asset.application === "video" && asset.type === "video"
        ? await probeVideo(source)
        : undefined;
    await processFile(source, destination, plan);
    if (measured && ["transcode", "preview"].includes(job.type))
      measured = await probeVideo(destination);
    const key = `${asset.r2_key}.variant/${job.id}.${plan.format}`;
    const bytes = await uploadProcessingObject(
      asset.application,
      asset.bucket_name,
      key,
      destination,
      plan.contentType,
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const lock = await client.query(
        "SELECT id FROM media_processing_job WHERE id=$1 AND status='processing' AND attempt_count=$2 FOR UPDATE",
        [job.id, job.attempt_count],
      );
      const live = await client.query(
        "SELECT id FROM media_asset WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        [asset.id],
      );
      if (!lock.rowCount || !live.rowCount) throw new Error("job_lease_lost");
      const variantId = crypto.randomUUID();
      const variant = await client.query(
        `INSERT INTO media_variant (id,asset_id,kind,name,r2_key,url,format,bytes,transformation)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (asset_id,name) DO UPDATE SET bytes=EXCLUDED.bytes,updated_at=now() RETURNING id`,
        [
          variantId,
          asset.id,
          plan.kind,
          `job-${job.id}`,
          key,
          `/media/variant/${variantId}/url`,
          plan.format,
          bytes,
          JSON.stringify(job.input),
        ],
      );
      await client.query(
        "UPDATE media_processing_job SET status='ready',output=$3,error=NULL,completed_at=now(),updated_at=now() WHERE id=$1 AND attempt_count=$2",
        [
          job.id,
          job.attempt_count,
          JSON.stringify({ variantId: variant.rows[0].id, bytes, ...measured }),
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return { processed: 1, status: "ready" };
  } catch {
    await pool.query(
      `UPDATE media_processing_job SET status=CASE WHEN attempt_count>=max_attempts THEN 'failed'::media_status ELSE 'pending'::media_status END,
      error='processing_failed',scheduled_at=now()+make_interval(secs=>least(3600,30*power(2,attempt_count)::int)),updated_at=now()
      WHERE id=$1 AND status='processing' AND attempt_count=$2`,
      [job.id, job.attempt_count],
    );
    return { processed: 1, status: "retry_or_failed" };
  } finally {
    // Only our explicit mkdtemp directory is removed, never caller-supplied paths.
    await rm(directory, { recursive: true, force: true });
  }
}
