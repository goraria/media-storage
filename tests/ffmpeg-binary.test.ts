import { execFile } from "node:child_process";
import { access, mkdtemp, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import ffprobe from "@derhuerst/ffprobe-static";
import { expect, it, vi } from "vitest";

vi.mock("@/utils/environment", () => ({ oauthClientBindings: undefined, ffmpegPath: undefined, ffprobePath: undefined }));

import { probeVideo, processFile, processingPlan } from "@/lib/processing/ffmpeg";

it("runs bundled executables through the real bounded probe and encode pipeline", async () => {
  expect(ffmpeg).toBeTruthy();
  expect(ffprobe).toBeTruthy();
  await access(ffmpeg!, constants.X_OK);
  await access(ffprobe!, constants.X_OK);
  const directory = await mkdtemp(join(tmpdir(), "gorth-media-binary-test-"));
  try {
    const source = join(directory, "source.mp4");
    const output = join(directory, "preview.mp4");
    const thumbnail = join(directory, "thumbnail.webp");
    await promisify(execFile)(ffmpeg!, [
      "-nostdin", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=blue:s=64x48:r=5:d=1",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", source,
    ], { timeout: 15_000, maxBuffer: 65536 });
    expect(await probeVideo(source)).toMatchObject({ width: 64, height: 48 });
    await processFile(source, output, processingPlan("preview", "video", { width: 32, height: 24 }));
    expect(await probeVideo(output)).toMatchObject({ width: 32, height: 24 });
    await processFile(source, thumbnail, processingPlan("thumbnail", "video", { width: 32, height: 24 }));
    expect((await stat(thumbnail)).size).toBeGreaterThan(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
