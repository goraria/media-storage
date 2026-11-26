import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  query: vi.fn(),
  sign: vi.fn(),
  verify: vi.fn(),
}));
vi.mock("@/database", () => ({
  pool: { query: async () => ({ rows: [] }) },
  database: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({ where: () => ({ limit: f.query }) }),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/s3/client", () => ({ createDownloadUrl: f.sign }));
vi.mock("@/lib/auth/machine", () => ({ verifyMachineRequest: f.verify }));
vi.mock("@/lib/auth/verification", () => ({
  serviceAuthFailure: () => new Response(null, { status: 403 }),
}));
import { rawInspectReaderAsset, rawGetReaderAssetUrl } from "@/services/reader";
import { requireReaderWorker } from "@/middlewares/reader-worker";
const row = {
  asset: {
    id: "asset",
    status: "ready",
    visibility: "private",
    originalFilename: "photo.png",
    mimeType: "image/png",
    bytes: 100,
    objectKey: "private/key",
  },
  bucket: { application: "reader", bucketName: "reader-private" },
  owner: { externalUserId: "owner" },
};
beforeEach(() => {
  vi.clearAllMocks();
  f.query.mockResolvedValue([row]);
  f.sign.mockResolvedValue("https://signed.example.test/file");
});
it("checks exact owner, readiness, privacy and bucket before returning asset information", async () => {
  expect(await rawInspectReaderAsset("asset", "owner")).toEqual({
    id: "asset",
    filename: "photo.png",
    contentType: "image/png",
    size: 100,
  });
  await expect(rawInspectReaderAsset("asset", "other")).rejects.toMatchObject({
    status: 404,
  });
  for (const invalid of [
    { ...row, asset: { ...row.asset, status: "processing" } },
    { ...row, asset: { ...row.asset, visibility: "public" } },
    { ...row, asset: { ...row.asset, deletedAt: new Date() } },
    { ...row, bucket: { ...row.bucket, application: "task" } },
  ]) {
    f.query.mockResolvedValue([invalid]);
    await expect(rawInspectReaderAsset("asset", "owner")).rejects.toMatchObject({
      status: 404,
    });
  }
});
it("signs only a 60-second URL and exposes no storage credentials", async () => {
  const result = await rawGetReaderAssetUrl("asset");
  expect(f.sign).toHaveBeenCalledWith(
    expect.objectContaining({ application: "reader", expiresIn: 60 }),
  );
  expect(result).toEqual({
    url: "https://signed.example.test/file",
    expiresIn: 60,
  });
});
it("requires the app-specific native machine scope and denies a rejected grant", async () => {
  const req = new Request("https://media.test/media/reader/asset"),
    next = vi.fn(async () => new Response("ok"));
  await requireReaderWorker()({ req: { raw: req } } as never, next as never);
  expect(f.verify).toHaveBeenCalledWith(req, "reader:media:delegate");
  f.verify.mockRejectedValue(new Error("denied"));
  next.mockClear();
  expect(
    ((await requireReaderWorker()({ req: { raw: req } } as never, next as never)) as Response)
      .status,
  ).toBe(403);
  expect(next).not.toHaveBeenCalled();
});
