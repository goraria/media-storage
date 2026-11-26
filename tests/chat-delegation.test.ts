import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  download: vi.fn(),
  verify: vi.fn(),
}));
vi.mock("@/database", () => ({
  database: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({ limit: async () => state.rows }),
          }),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/s3/client", () => ({ createDownloadUrl: state.download }));
vi.mock("@/lib/auth/machine", () => ({ verifyMachineRequest: state.verify }));
vi.mock("@/lib/auth/verification", () => ({
  serviceAuthFailure: () => new Response(null, { status: 403 }),
}));
import {
  rawGetChatAsset,
  rawInspectChatAsset,
  rawGetChatAssetUrl,
} from "@/services/chat";
import { requireChatWorker } from "@/middlewares/chat-worker";
beforeEach(() => {
  state.rows = [
    {
      asset: {
        id: "asset",
        application: "chat",
        resourceType: "conversation",
        resourceId: "conversation",
        status: "ready",
        visibility: "private",
        objectKey: "key",
        originalFilename: "safe.png",
        mimeType: "image/png",
        bytes: 200,
      },
      bucket: { application: "chat", bucketName: "chat-bucket" },
      owner: { externalUserId: "sender" },
    },
  ];
  state.download.mockReset().mockResolvedValue("https://storage.test/signed");
  state.verify.mockReset();
});
it("checks asset ownership before a binding can be created", async () => {
  expect(
    await rawInspectChatAsset("asset", "conversation", "sender"),
  ).toMatchObject({ filename: "safe.png", size: 200 });
  await expect(
    rawGetChatAsset("asset", "conversation", "another-user"),
  ).rejects.toMatchObject({ status: 404 });
});
it("does not delegate Task assets, public objects or unfinished uploads", async () => {
  for (const patch of [{ status: "uploading" }, { visibility: "public" }]) {
    state.rows = [
      {
        ...(state.rows[0] as object),
        asset: { ...(state.rows[0] as { asset: object }).asset, ...patch },
      },
    ];
    await expect(rawGetChatAsset("asset", "conversation")).rejects.toMatchObject({
      status: 404,
    });
  }
  expect(state.download).not.toHaveBeenCalled();
});
it("signs for the registered Chat bucket with a 60-second TTL", async () => {
  expect(await rawGetChatAssetUrl("asset", "conversation")).toMatchObject({
    expiresIn: 60,
  });
  expect(state.download).toHaveBeenCalledWith(
    expect.objectContaining({
      application: "chat",
      bucket: "chat-bucket",
      expiresIn: 60,
    }),
  );
});
it("requires the Chat-specific machine scope and never runs a handler after denial", async () => {
  const request = new Request("https://media.test/media/chat/asset");
  const next = vi.fn(async () => new Response("ok"));
  await requireChatWorker()({ req: { raw: request } } as never, next as never);
  expect(state.verify).toHaveBeenCalledWith(request, "chat:media:delegate");
  state.verify.mockRejectedValue(new Error("denied"));
  next.mockClear();
  const response = await requireChatWorker()(
    { req: { raw: request } } as never,
    next as never,
  );
  expect((response as Response).status).toBe(403);
  expect(next).not.toHaveBeenCalled();
});
