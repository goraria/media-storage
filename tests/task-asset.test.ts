import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as unknown[][], sign: vi.fn() }));
vi.mock("@/database", () => ({
  database: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => state.rows.shift() ?? [] }),
      }),
    }),
  },
}));
vi.mock("@/lib/s3/client", () => ({ createDownloadUrl: state.sign }));
import { rawGetTaskAssetUrl } from "@/models/media-asset";
const asset = () => ({
  id: "asset",
  application: "task",
  resourceType: "page",
  resourceId: "page",
  status: "ready",
  bucketId: "bucket",
  objectKey: "task/private/object",
  originalFilename: "notes.txt",
});
beforeEach(() => {
  vi.resetAllMocks();
  state.rows = [
    [asset()],
    [{ application: "task", bucketName: "task-bucket" }],
  ];
  state.sign.mockResolvedValue("https://objects.example.test/signed");
});
it("signs only the bound Task page asset with a short expiry", async () => {
  expect(await rawGetTaskAssetUrl("asset", "page")).toEqual({
    url: "https://objects.example.test/signed",
    expiresIn: 60,
  });
  expect(state.sign).toHaveBeenCalledWith({
    application: "task",
    bucket: "task-bucket",
    key: "task/private/object",
    filename: "notes.txt",
    expiresIn: 60,
  });
});
it.each([
  { application: "social" },
  { resourceType: "avatar" },
  { resourceId: "another-page" },
  { status: "deleted" },
  { status: "uploading" },
])("does not sign an unbound or unavailable asset %j", async (override) => {
  state.rows = [[{ ...asset(), ...override }]];
  await expect(rawGetTaskAssetUrl("asset", "page")).rejects.toThrow(
    "media_asset_not_found",
  );
  expect(state.sign).not.toHaveBeenCalled();
});
it("does not cross a foreign application's bucket", async () => {
  state.rows = [[asset()], [{ application: "social", bucketName: "foreign" }]];
  await expect(rawGetTaskAssetUrl("asset", "page")).rejects.toThrow(
    "media_asset_not_found",
  );
  expect(state.sign).not.toHaveBeenCalled();
});
