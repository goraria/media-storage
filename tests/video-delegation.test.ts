import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  query: vi.fn(),
  sign: vi.fn(),
  verify: vi.fn(),
}));
vi.mock("@/database", () => ({
  pool: {
    query: f.query,
    connect: async () => ({ query: f.query, release: vi.fn() }),
  },
}));
vi.mock("@/lib/s3/client", () => ({ createDownloadUrl: f.sign }));
vi.mock("@/lib/auth/machine", () => ({ verifyMachineRequest: f.verify }));
vi.mock("@/lib/auth/verification", () => ({
  serviceAuthFailure: () => new Response(null, { status: 403 }),
}));
import {
  rawGetVideoAsset,
  rawInspectVideoAsset,
  rawPrepareVideoAsset,
  rawGetVideoAssetUrl,
} from "@/services/video";
import { videoAssetSchema } from "@/schemas/video";
import { requireVideoWorker } from "@/middlewares/video-worker";
const assetId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  job = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const videoId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const asset = {
  id: assetId,
  application: "video",
  type: "video",
  mime_type: "video/mp4",
  bytes: 1000,
  r2_key: "video/owner/source.mp4",
  resource_id: videoId,
  bucket_name: "private-video",
};
let status = "ready",
  duration = 45;
beforeEach(() => {
  vi.clearAllMocks();
  status = "ready";
  duration = 45;
  f.verify.mockResolvedValue({});
  f.sign.mockResolvedValue("https://signed.example.test/file");
  f.query.mockImplementation(async (q: string) => {
    if (q.includes("SELECT a.*")) return { rows: [asset] };
    if (q.includes("DISTINCT ON"))
      return {
        rows: [
          { type: "transcode", status, output: { duration } },
          { type: "thumbnail", status, output: {} },
        ],
      };
    if (q.includes("SELECT v.*"))
      return {
        rows: [
          { r2_key: asset.r2_key + ".variant/" + job + ".mp4", job_id: job },
        ],
      };
    return { rows: [] };
  });
});
it("looks up exact application, owner, private storage and resource type before processing", async () => {
  await rawGetVideoAsset(assetId, "owner", videoId);
  expect(f.query).toHaveBeenCalledWith(
    expect.stringContaining("a.visibility='private'"),
    [assetId, "owner", videoId],
  );
  expect(f.query.mock.calls[0]![0]).toContain("a.application='video'");
  expect(f.query.mock.calls[0]![0]).toContain(
    "a.resource_type='video-content'",
  );
});
it("rejects a missing, deleted or foreign asset from the restricted query", async () => {
  f.query.mockResolvedValue({ rows: [] });
  await expect(rawGetVideoAsset(assetId, "other", videoId)).rejects.toMatchObject({
    status: 404,
  });
});
it.each(["text/html", "application/octet-stream", "image/svg+xml"])(
  "rejects unsupported uploaded type %s",
  async (mime) => {
    f.query.mockResolvedValue({ rows: [{ ...asset, mime_type: mime }] });
    await expect(
      rawGetVideoAsset(assetId, "owner", videoId),
    ).rejects.toMatchObject({ status: 404 });
  },
);
it.each([0, 536870913])("rejects invalid upload size %s", async (bytes) => {
  f.query.mockResolvedValue({ rows: [{ ...asset, bytes }] });
  await expect(rawGetVideoAsset(assetId, "owner", videoId)).rejects.toMatchObject({
    status: 404,
  });
});
it("serializes preparation on the asset and avoids duplicate nonfailed jobs", async () => {
  await rawPrepareVideoAsset(assetId, "owner", videoId);
  expect(
    f.query.mock.calls.some(([q]) => String(q).includes("FOR UPDATE")),
  ).toBe(true);
  const inserts = f.query.mock.calls.filter(([q]) =>
    String(q).includes("INSERT INTO media_processing_job"),
  );
  expect(inserts).toHaveLength(2);
  expect(inserts[0]![0]).toContain("WHERE NOT EXISTS");
  expect(JSON.parse(inserts[0]![1][3])).toMatchObject({
    second: 0,
    width: 1280,
    height: 720,
  });
});
it("reports measured duration without exposing object keys or credentials", async () => {
  expect(await rawInspectVideoAsset(assetId, "owner", videoId)).toMatchObject({
    status: "ready",
    duration: 45,
  });
  expect(
    JSON.stringify(await rawInspectVideoAsset(assetId, "owner", videoId)),
  ).not.toContain("r2_key");
});
it("does not sign files while processing is incomplete", async () => {
  status = "processing";
  await expect(
    rawGetVideoAssetUrl(assetId, "owner", "transcode", videoId),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.sign).not.toHaveBeenCalled();
});
it("signs only the worker output for the bound asset for 120 seconds", async () => {
  expect(
    await rawGetVideoAssetUrl(assetId, "owner", "transcode", videoId),
  ).toMatchObject({ contentType: "video/mp4", expiresIn: 120 });
  expect(f.sign).toHaveBeenCalledWith(
    expect.objectContaining({
      key: asset.r2_key + ".variant/" + job + ".mp4",
      application: "video",
      expiresIn: 120,
    }),
  );
});
it("rejects a variant whose key was edited outside the worker result", async () => {
  const original = f.query.getMockImplementation()!;
  f.query.mockImplementation(async (q: string, ...args: unknown[]) =>
    q.includes("SELECT v.*")
      ? { rows: [{ r2_key: "foreign/object", job_id: job }] }
      : original(q, ...args),
  );
  await expect(
    rawGetVideoAssetUrl(assetId, "owner", "transcode", videoId),
  ).rejects.toMatchObject({ status: 403 });
  expect(f.sign).not.toHaveBeenCalled();
});
it("requires the Video-specific machine scope and denies user/browser grants", async () => {
  const req = new Request("https://media.example.test/media/video/prepare"),
    next = vi.fn(async () => new Response("ok"));
  await requireVideoWorker()({ req: { raw: req } } as never, next as never);
  expect(f.verify).toHaveBeenCalledWith(req, "video:media:delegate");
  f.verify.mockRejectedValue(new Error("user token"));
  next.mockClear();
  expect(
    ((await requireVideoWorker()({ req: { raw: req } } as never, next as never)) as Response)
      .status,
  ).toBe(403);
  expect(next).not.toHaveBeenCalled();
});
it("does not accept browser-supplied bucket, endpoint, URL or job output", () => {
  for (const extra of [
    { endpoint: "https://foreign.test" },
    { bucket: "other" },
    { url: "https://foreign.test" },
    { status: "ready" },
  ])
    expect(
      videoAssetSchema.safeParse({
        assetId,
        videoId,
        ownerExternalUserId: "owner",
        ...extra,
      }).success,
    ).toBe(false);
});
