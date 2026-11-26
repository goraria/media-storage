import { expect, it, vi } from "vitest";
vi.mock("@/models/media-storage-profile", () => ({
  rawGetStorageProfile: async () => ({
    endpoint: "https://storage.example",
    region: "ap-southeast-1",
    credentialsUrl: "https://sso.example/internal/storage/credential",
  }),
}));
vi.mock("@/lib/storage/credentials", () => ({
  getStorageCredentials: async () => ({
    accessKeyId: "fixture-id",
    secretAccessKey: "fixture-secret",
  }),
}));
import { createUploadUrl } from "@/lib/s3/client";

it("presigns real SDK PUTs without a checksum for an absent body", async () => {
  const url = new URL(
    await createUploadUrl({
      application: "sso",
      bucket: "fixture-avatar",
      key: "fixture.png",
      contentType: "image/png",
      size: 8,
      expiresIn: 120,
    }),
  );
  expect(url.origin).toBe("https://storage.example");
  expect(url.pathname).toBe("/fixture-avatar/fixture.png");
  expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
  expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain(
    "content-length",
  );
  expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-type");
  expect(
    [...url.searchParams.keys()].filter((key) => /checksum/i.test(key)),
  ).toEqual([]);
  expect(url.searchParams.get("X-Amz-SignedHeaders")).not.toMatch(
    /authorization|cookie|checksum/i,
  );
});
