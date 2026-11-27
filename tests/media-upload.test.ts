import { beforeEach, expect, it, vi } from "vitest";
import type { AuthContext } from "@/utils/interface";
import { createUploadSchema } from "@/schemas/media";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  filters: [] as unknown[][],
  values: {} as Record<string, Record<string, unknown>>,
  signed: vi.fn(async () => "https://neon.example/file?signature=test"),
  head: vi.fn(),
  prefix: vi.fn(),
  transactions: vi.fn(),
}));
vi.mock("@/lib/s3/client", () => ({
  createUploadUrl: state.signed,
  headObject: state.head,
  readObjectPrefix: state.prefix,
  abortMultipartUpload: vi.fn(),
  beginMultipartUpload: vi.fn(),
  completeMultipartUpload: vi.fn(),
  createDownloadUrl: vi.fn(),
  createMultipartPartUrl: vi.fn(),
  deleteObject: vi.fn(),
  headBucket: vi.fn(),
}));
vi.mock("@/database", async () => {
  const { getTableName } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  function update(table: Parameters<typeof getTableName>[0]) {
    return {
      set(value: Record<string, unknown>) {
        return {
          where() {
            const name = getTableName(table);
            state.values[name] = { ...state.values[name], ...value };
            return { returning: async () => [state.values[name]] };
          },
        };
      },
    };
  }
  function insert(table: Parameters<typeof getTableName>[0]) {
    return {
      values(value: Record<string, unknown>) {
        const record = { id: "generated-session-id", ...value };
        state.values[getTableName(table)] = record;
        return {
          returning: async () => [record],
          onConflictDoNothing: async () => undefined,
        };
      },
    };
  }
  const database = {
    select() {
      const query = {
        from: () => query,
        innerJoin: () => query,
        where(filter: SQL) {
          state.filters.push(new PgDialect().sqlToQuery(filter).params);
          return query;
        },
        limit: async () => state.rows.shift() ?? [],
      };
      return query;
    },
    insert,
    update,
    async transaction<T>(
      fn: (transaction: {
        update: typeof update;
        insert: typeof insert;
      }) => Promise<T>,
    ): Promise<T> {
      state.transactions();
      return fn({ update, insert });
    },
  };
  return { database };
});
import { rawCreateUpload, rawCompleteUpload } from "@/models/media-asset";

const subject = "sso-user";
const bucket = {
  id: "edbf8035-4e9a-4cf9-a164-b6cf34d18a72",
  application: "sso",
  name: "avatar",
  bucketName: "sso-neon-avatar",
  storagePrefix: "avatar",
  allowedTypes: ["image"],
  maxFileSize: 2097152,
};
const auth: AuthContext = {
  application: "sso",
  clientId: "gorth-single-sign-on",
  scopes: ["sso:write"],
  sessionId: "session",
  user: {
    id: "5dbf8035-4e9a-4cf9-a164-b6cf34d18a72",
    externalUserId: subject,
    name: "Uploader",
    email: "upload@example.test",
    role: "user",
    status: "active",
    username: null,
    image: null,
    banExpires: null,
    bannedAt: null,
    deletedAt: null,
    metadata: {},
    lastSeenAt: null,
    syncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};
const input = () =>
  createUploadSchema.parse({
    bucket: bucket.id,
    filename: "avatar.png",
    contentType: "image/png",
    size: 8,
    type: "image",
    resourceType: "avatar",
    resourceId: subject,
    visibility: "public",
  });
beforeEach(() => {
  state.rows = [[bucket]];
  state.filters = [];
  state.values = {};
  state.signed.mockClear();
  state.head.mockReset();
  state.prefix.mockReset();
  state.prefix.mockResolvedValue(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  state.transactions.mockClear();
});
it("creates a scoped upload and completes only after storage metadata matches", async () => {
  const created = await rawCreateUpload(input(), auth);
  expect(state.filters[0]).toEqual([bucket.id, "sso"]);
  expect(state.signed).toHaveBeenCalledWith(
    expect.objectContaining({
      application: "sso",
      bucket: "sso-neon-avatar",
      contentType: "image/png",
    }),
  );
  expect(created.asset.deliveryPath).toBe(`/media/public/${created.asset.id}`);
  state.rows = [
    [
      {
        upload: {
          ...state.values.media_upload_session,
          expiresAt: new Date(Date.now() + 60000),
          multipartUploadId: null,
        },
        asset: state.values.media_asset,
        bucket,
      },
    ],
  ];
  state.head.mockResolvedValue({
    ContentLength: 8,
    ContentType: "image/png",
    ETag: '"checksum"',
  });
  const ready = await rawCompleteUpload(created.upload.id, {}, auth);
  expect(state.filters.at(-1)).toEqual([
    created.upload.id,
    auth.user.id,
    "sso",
  ]);
  expect(state.head).toHaveBeenCalledWith(
    "sso-neon-avatar",
    created.asset.objectKey,
    "sso",
  );
  expect(ready.status).toBe("ready");
  expect(state.transactions).toHaveBeenCalled();
});
it("never signs an upload for a missing or foreign bucket", async () => {
  state.rows = [[]];
  await expect(rawCreateUpload(input(), auth)).rejects.toThrow(
    "media_bucket_not_found",
  );
  expect(state.signed).not.toHaveBeenCalled();
});
it("rejects another subject, wrong purpose and non-avatar SSO buckets", async () => {
  for (const change of [
    { resourceId: "other-user" },
    { type: "video" as const },
    { resourceType: "other" },
    { size: 2097153 },
  ]) {
    state.rows = [[bucket]];
    await expect(rawCreateUpload({ ...input(), ...change }, auth)).rejects.toThrow(
      "invalid_avatar_upload",
    );
  }
  state.rows = [[{ ...bucket, name: "other" }]];
  await expect(rawCreateUpload(input(), auth)).rejects.toThrow(
    "invalid_avatar_upload",
  );
  expect(state.signed).not.toHaveBeenCalled();
});
it("does not mark mismatched provider data ready", async () => {
  for (const object of [
    { ContentLength: 9, ContentType: "image/png" },
    { ContentLength: 8, ContentType: "image/jpeg" },
    { ContentType: "image/png" },
  ]) {
    state.rows = [
      [
        {
          upload: {
            id: "upload",
            status: "uploading",
            objectKey: "key",
            uploadParameters: { size: 8 },
            expiresAt: new Date(Date.now() + 60000),
          },
          asset: { id: "asset", mimeType: "image/png" },
          bucket,
        },
      ],
    ];
    state.head.mockResolvedValue(object);
    await expect(rawCompleteUpload("upload", {}, auth)).rejects.toThrow();
  }
  expect(state.transactions).not.toHaveBeenCalled();
});
it("checks actual stored image bytes before completing a direct browser PUT", async () => {
  state.rows = [
    [
      {
        upload: {
          id: "upload",
          status: "uploading",
          objectKey: "key",
          uploadParameters: { size: 8 },
          expiresAt: new Date(Date.now() + 60000),
        },
        asset: { id: "asset", mimeType: "image/png", resourceType: "avatar" },
        bucket,
      },
    ],
  ];
  state.head.mockResolvedValue({ ContentLength: 8, ContentType: "image/png" });
  state.prefix.mockResolvedValueOnce(
    new Uint8Array([60, 115, 99, 114, 105, 112, 116, 62]),
  );
  await expect(rawCompleteUpload("upload", {}, auth)).rejects.toThrow(
    "media_upload_content_invalid",
  );
  expect(state.transactions).not.toHaveBeenCalled();
});
it("rejects a Chat attachment with a spoofed image MIME type before marking it ready", async () => {
  state.rows = [
    [
      {
        upload: {
          id: "upload",
          status: "uploading",
          objectKey: "key",
          uploadParameters: { size: 8 },
          expiresAt: new Date(Date.now() + 60000),
        },
        asset: {
          id: "asset",
          application: "chat",
          mimeType: "image/png",
          resourceType: "conversation",
        },
        bucket: { ...bucket, application: "chat" },
      },
    ],
  ];
  state.head.mockResolvedValue({ ContentLength: 8, ContentType: "image/png" });
  state.prefix.mockResolvedValue(new TextEncoder().encode("<script>"));
  await expect(
    rawCompleteUpload("upload", {}, { ...auth, application: "chat" }),
  ).rejects.toThrow("media_upload_content_invalid");
  expect(state.transactions).not.toHaveBeenCalled();
});
it("keeps the existing Task upload completion path unchanged", async () => {
  state.rows = [
    [
      {
        upload: {
          id: "upload",
          status: "uploading",
          objectKey: "key",
          uploadParameters: { size: 8 },
          expiresAt: new Date(Date.now() + 60000),
        },
        asset: {
          id: "asset",
          application: "task",
          mimeType: "image/png",
          resourceType: "page",
        },
        bucket: { ...bucket, application: "task" },
      },
    ],
  ];
  state.head.mockResolvedValue({ ContentLength: 8, ContentType: "image/png" });
  expect(
    (await rawCompleteUpload("upload", {}, { ...auth, application: "task" }))
      .status,
  ).toBe("ready");
  expect(state.prefix).not.toHaveBeenCalled();
});
it("queues a deterministic Social processing job in the completion transaction", async () => {
  state.rows = [
    [
      {
        upload: {
          id: "upload",
          status: "uploading",
          objectKey: "key",
          uploadParameters: { size: 8 },
          expiresAt: new Date(Date.now() + 60000),
        },
        asset: {
          id: "social-asset",
          application: "social",
          type: "image",
          mimeType: "image/png",
          resourceType: "social-content",
        },
        bucket: { ...bucket, application: "social" },
      },
    ],
  ];
  state.head.mockResolvedValue({ ContentLength: 8, ContentType: "image/png" });
  expect(
    (await rawCompleteUpload("upload", {}, { ...auth, application: "social" }))
      .status,
  ).toBe("ready");
  expect(state.values.media_processing_job).toMatchObject({
    id: "social-asset",
    assetId: "social-asset",
    type: "optimize",
    input: { format: "webp" },
  });
});
