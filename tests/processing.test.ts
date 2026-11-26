import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  query: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  process: vi.fn(),
}));
vi.mock("@/database", () => ({
  pool: {
    query: state.query,
    connect: async () => ({ query: state.query, release: vi.fn() }),
  },
}));
vi.mock("@/utils/environment", () => ({ oauthClientBindings: undefined, ffmpegPath: "ffmpeg" }));
vi.mock("@/lib/s3/client", () => ({
  downloadProcessingObject: state.download,
  uploadProcessingObject: state.upload,
}));
vi.mock("@/lib/processing/ffmpeg", async (original) => ({
  ...(await original<typeof import("@/lib/processing/ffmpeg")>()),
  processFile: state.process,
}));
import { processingPlan } from "@/lib/processing/ffmpeg";
import { rawProcessNextJob } from "@/models/media-processing-job";
import { isProcessingObjectKey } from "@/utils/media";
beforeEach(() => {
  vi.clearAllMocks();
  state.query.mockReset();
  state.download.mockResolvedValue(undefined);
  state.process.mockResolvedValue(undefined);
  state.upload.mockResolvedValue(100);
});
it("builds bounded image, cropped thumbnail, video preview and audio plans", () => {
  expect(processingPlan("resize", "image", {}).format).toBe("webp");
  expect(
    processingPlan("crop", "image", { width: 64, height: 64 }).args.join(" "),
  ).toContain("crop=64:64");
  expect(processingPlan("preview", "video", {}).args).toContain("30");
  expect(processingPlan("transcode", "video", {}).contentType).toBe(
    "video/mp4",
  );
  expect(processingPlan("extract", "video", {}).contentType).toBe("audio/mpeg");
});
it.each([
  { width: 99999 },
  { width: -1 },
  { format: "svg" },
  { args: "; curl example" },
  { source: "https://foreign.example" },
  { second: Infinity },
])("rejects unsafe processing options %o", (input) => {
  expect(() => processingPlan("resize", "image", input)).toThrow();
});
it("rejects incompatible assets, formats and job types", () => {
  expect(() => processingPlan("transcode", "document", {})).toThrow();
  expect(() => processingPlan("resize", "image", { format: "mp4" })).toThrow();
  expect(() => processingPlan("shell", "image", {})).toThrow();
});
it("never signs or deletes a key outside the owning asset variant namespace", () => {
  const source = "video/owner/source.png";
  expect(
    isProcessingObjectKey(
      source,
      `${source}.variant/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`,
    ),
  ).toBe(true);
  for (const key of [
    "video/other/source.png",
    `${source}.variant/../../other`,
    `${source}.variant/evil.webp`,
    `${source}.variant/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.svg`,
  ])
    expect(isProcessingObjectKey(source, key)).toBe(false);
});
it("recovers stale leases and atomically claims no more than one due job", async () => {
  state.query.mockResolvedValue({ rows: [] });
  expect(await rawProcessNextJob()).toEqual({ processed: 0 });
  expect(state.query.mock.calls[0]![0]).toContain("worker_lease_expired");
  expect(state.query.mock.calls[1]![0]).toContain(
    "FOR UPDATE SKIP LOCKED LIMIT 1",
  );
  expect(state.query.mock.calls[1]![0]).toContain("attempt_count<max_attempts");
});
it("executes download, processor, upload, variant persistence and fenced completion", async () => {
  state.query.mockImplementation(async (query: string) => {
    if (query.includes("RETURNING *"))
      return {
        rows: [
          {
            id: "job",
            asset_id: "asset",
            type: "resize",
            input: { width: 128, height: 128 },
            attempt_count: 1,
          },
        ],
      };
    if (query.includes("SELECT a.*"))
      return {
        rows: [
          {
            id: "asset",
            type: "image",
            application: "video",
            bucket_name: "video-bucket",
            r2_key: "owner/original.png",
          },
        ],
      };
    if (query.includes("INSERT INTO media_variant"))
      return { rows: [{ id: "variant" }], rowCount: 1 };
    return { rows: [{ id: "locked" }], rowCount: 1 };
  });
  expect(await rawProcessNextJob()).toEqual({ processed: 1, status: "ready" });
  expect(state.download.mock.calls[0]!.slice(0, 3)).toEqual([
    "video",
    "video-bucket",
    "owner/original.png",
  ]);
  expect(state.process).toHaveBeenCalledOnce();
  expect(state.upload.mock.calls[0]![2]).toBe(
    "owner/original.png.variant/job.webp",
  );
  expect(
    state.query.mock.calls.some(([query]) =>
      query.includes("attempt_count=$2 FOR UPDATE"),
    ),
  ).toBe(true);
  expect(state.query).toHaveBeenLastCalledWith("COMMIT");
});
it("reschedules a failed processor and does not publish an incomplete variant", async () => {
  state.query.mockImplementation(async (query: string) => {
    if (query.includes("RETURNING *"))
      return {
        rows: [
          {
            id: "job",
            asset_id: "asset",
            type: "resize",
            input: {},
            attempt_count: 2,
          },
        ],
      };
    if (query.includes("SELECT a.*"))
      return {
        rows: [
          {
            id: "asset",
            type: "image",
            application: "video",
            bucket_name: "video-bucket",
            r2_key: "owner/original.png",
          },
        ],
      };
    return { rows: [] };
  });
  state.process.mockRejectedValue(new Error("ffmpeg private details"));
  expect(await rawProcessNextJob()).toMatchObject({ status: "retry_or_failed" });
  expect(state.upload).not.toHaveBeenCalled();
  expect(state.query.mock.calls.at(-1)![0]).toContain("attempt_count=$2");
  expect(JSON.stringify(state.query.mock.calls)).not.toContain(
    "private details",
  );
});
