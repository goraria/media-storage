import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/database", () => ({
  database: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ innerJoin: () => ({ where: f.query }) }),
      }),
    }),
  },
}));
import { rawInspectReaderAssets } from "@/services/reader-inspect";
beforeEach(() => {
  vi.clearAllMocks();
  f.query.mockResolvedValue([
    { id: "asset", contentType: "image/png", size: 100, subject: "owner" },
  ]);
});
it("returns public metadata only for the exact ready-asset batch", async () => {
  expect(await rawInspectReaderAssets(["asset"], "owner")).toEqual({
    data: [{ id: "asset", contentType: "image/png", size: 100 }],
  });
});
it("rejects duplicate, missing, unsafe or over-sized assets", async () => {
  await expect(rawInspectReaderAssets(["asset", "asset"])).rejects.toMatchObject({
    status: 403,
  });
  await expect(rawInspectReaderAssets(["asset", "missing"])).rejects.toMatchObject(
    { status: 403 },
  );
  for (const row of [
    { id: "asset", contentType: "image/svg+xml", size: 100 },
    { id: "asset", contentType: "image/png", size: 0 },
    { id: "asset", contentType: "image/png", size: 21 * 1024 * 1024 },
  ]) {
    f.query.mockResolvedValue([row]);
    await expect(rawInspectReaderAssets(["asset"])).rejects.toMatchObject({
      status: 403,
    });
  }
});
