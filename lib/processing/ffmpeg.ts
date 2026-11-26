import { execFile } from "node:child_process";
import { promisify } from "node:util";
import bundledFfmpeg from "ffmpeg-static";
import bundledFfprobe from "@derhuerst/ffprobe-static";
import { ffmpegPath, ffprobePath } from "@/utils/environment";
import { processingInputSchema } from "@/schemas/processing";

export async function probeVideo(source: string) {
  const executable = ffprobePath || bundledFfprobe;
  if (!executable) throw new Error("unsupported_ffprobe_platform");
  const { stdout } = await promisify(execFile)(
    executable,
    [
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-show_entries",
      "format=duration:stream=codec_type,width,height",
      "-of",
      "json",
      source,
    ],
    { timeout: 15000, maxBuffer: 65536, windowsHide: true },
  );
  const data = JSON.parse(stdout);
  const duration = Number(data.format?.duration);
  const video = data.streams?.find(
    (s: { codec_type: string }) => s.codec_type === "video",
  );
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 7200 ||
    !video ||
    video.width > 8192 ||
    video.height > 8192
  )
    throw new Error("unsupported_video_dimensions_or_duration");
  return { duration, width: Number(video.width), height: Number(video.height) };
}

export function processingPlan(
  type: string,
  mediaType: string,
  rawInput: unknown,
) {
  const input = processingInputSchema.parse(rawInput);
  const image = ["resize", "crop", "optimize", "thumbnail", "convert"].includes(
    type,
  );
  const audio = type === "extract";
  if (!image && !audio && !["transcode", "preview"].includes(type))
    throw new Error("unsupported_job_type");
  if (image && !["image", "video"].includes(mediaType))
    throw new Error("unsupported_asset_type");
  if (!image && !["audio", "video"].includes(mediaType))
    throw new Error("unsupported_asset_type");
  if (!image && !audio && mediaType !== "video")
    throw new Error("unsupported_asset_type");
  const format = input.format ?? (image ? "webp" : audio ? "mp3" : "mp4");
  if (
    (image && !["webp", "png", "jpg"].includes(format)) ||
    (audio && format !== "mp3") ||
    (!image && !audio && format !== "mp4")
  )
    throw new Error("unsupported_output_format");
  const scale = `scale=${input.width}:${input.height}:force_original_aspect_ratio=${type === "crop" ? "increase" : "decrease"}`;
  const filter =
    type === "crop" ? `${scale},crop=${input.width}:${input.height}` : scale;
  const args = image
    ? ["-vf", filter, "-frames:v", "1", "-an"]
    : audio
      ? ["-vn", "-c:a", "libmp3lame", "-b:a", "192k", "-t", "7200"]
      : [
          "-vf",
          `${filter},pad=ceil(iw/2)*2:ceil(ih/2)*2`,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          "-t",
          type === "preview" ? "30" : "7200",
        ];
  return {
    format,
    contentType: image
      ? `image/${format === "jpg" ? "jpeg" : format}`
      : audio
        ? "audio/mpeg"
        : "video/mp4",
    kind: image
      ? type === "thumbnail"
        ? "thumbnail"
        : "optimized"
      : audio
        ? "transcode"
        : type === "preview"
          ? "preview"
          : "transcode",
    second: input.second,
    args,
  };
}

export async function processFile(
  source: string,
  destination: string,
  plan: ReturnType<typeof processingPlan>,
) {
  const executable = ffmpegPath || bundledFfmpeg;
  if (!executable) throw new Error("unsupported_ffmpeg_platform");
  // No shell, caller-provided flags, remote protocols, playlist demuxers or unlimited runtime.
  await promisify(execFile)(
    executable,
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-max_alloc",
      "268435456",
      "-threads",
      "2",
      "-protocol_whitelist",
      "file,pipe",
      "-format_whitelist",
      "mov,matroska,avi,mp3,wav,flac,ogg,aac,image2,png_pipe,jpeg_pipe,webp_pipe",
      "-ss",
      String(plan.second),
      "-i",
      source,
      ...plan.args,
      "-threads",
      "2",
      "-y",
      destination,
    ],
    { timeout: 120_000, killSignal: "SIGKILL", maxBuffer: 64 * 1024 },
  );
}
