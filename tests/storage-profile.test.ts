import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/modules/structure/sso-directory", () => ({
  getApplicationOrigin: async () => "https://sso.example",
}));
const state = vi.hoisted(() => ({
  profiles: [] as unknown[],
  production: true,
}));
vi.mock("@/utils/environment", () => ({
  oauthClientBindings: undefined,
  authUrl: "https://sso.example",
  oauthClientId: "native-media-client",
  oauthClientSecret: "oauth-client-secret",
  get isProduction() {
    return state.production;
  },
}));
vi.mock("@/database", () => ({
  database: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => state.profiles }) }),
    }),
  },
}));
import { rawGetStorageProfile } from "@/models/media-storage-profile";
import { getStorageCredentials } from "@/lib/storage/credentials";
import {
  credentialsUrlSchema,
  storageProfileSchema,
} from "@/schemas/storage-profile";
import { readPrivateJson } from "@/utils/private-response";
const profile = {
  id: "profile",
  application: "sso",
  bucketName: "avatars",
  endpoint: "https://neon.example",
  region: "ap-southeast-1",
  credentialsUrl: "https://sso.example/internal/storage/credential",
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
function credentials(change = {}) {
  return {
    accessKeyId: "neon-id",
    secretAccessKey: "neon-secret",
    endpoint: profile.endpoint,
    region: profile.region,
    bucketName: profile.bucketName,
    ...change,
  };
}
function transport(change = {}) {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        access_token: "native-machine-token",
        token_type: "Bearer",
        expires_in: 120,
      }),
    )
    .mockResolvedValueOnce(Response.json(credentials(change)));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
beforeEach(() => {
  vi.unstubAllGlobals();
  state.profiles = [];
  state.production = true;
});
it("fails closed without an enabled registered profile", async () => {
  const fetch = transport();
  await expect(rawGetStorageProfile("sso", "avatars")).rejects.toThrow(
    "storage_profile_not_configured",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("obtains a scoped native client-credentials token and calls only the registered backend", async () => {
  const fetch = transport();
  await expect(getStorageCredentials(profile)).resolves.toEqual({
    accessKeyId: "neon-id",
    secretAccessKey: "neon-secret",
  });
  const [url, options] = fetch.mock.calls[0]!;
  expect(String(url)).toBe("https://sso.example/auth/oauth2/token");
  expect(Object.fromEntries(options.body)).toEqual({
    grant_type: "client_credentials",
    scope: "storage:sso:credential",
    resource: profile.credentialsUrl,
  });
  expect(new Headers(options.headers).get("authorization")).toBe(
    "Basic " + Buffer.from("native-media-client:oauth-client-secret").toString("base64"),
  );
  expect(fetch.mock.calls[1]![0]).toBe(profile.credentialsUrl);
  expect(fetch.mock.calls[1]![1].headers).toEqual({
    Authorization: "Bearer native-machine-token",
    "Content-Type": "application/json",
  });
  for (const [, options] of fetch.mock.calls) {
    expect(options.redirect).toBe("error");
    expect(options.cache).toBe("no-store");
    expect(options.headers).not.toHaveProperty("Cookie");
  }
});
it("never forwards credentials obtained for a different bucket, endpoint or region", async () => {
  for (const change of [
    { bucketName: "foreign" },
    { endpoint: "https://foreign.example" },
    { region: "us-east-1" },
  ]) {
    transport(change);
    await expect(getStorageCredentials(profile)).rejects.toThrow(
      "storage_credentials_unavailable",
    );
  }
});
it("redacts provider failures and fetches rotated credentials on the next operation", async () => {
  const fetch = transport();
  fetch
    .mockReset()
    .mockRejectedValueOnce(new Error("private-secret-from-provider"));
  await expect(getStorageCredentials(profile)).rejects.toThrow(
    "storage_credentials_unavailable",
  );
  transport({ secretAccessKey: "rotated-key" });
  await expect(getStorageCredentials(profile)).resolves.toMatchObject({
    secretAccessKey: "rotated-key",
  });
});
it("rejects raw keys, obsolete secret references and unsafe destinations in registry input", () => {
  const input = {
    bucketName: profile.bucketName,
    endpoint: profile.endpoint,
    region: profile.region,
    credentialsUrl: profile.credentialsUrl,
  };
  expect(storageProfileSchema.safeParse(input).success).toBe(true);
  for (const extra of [
    { accessKeyId: "bad" },
    { metadata: { secret: "bad" } },
    { credentialsSecretId: "old" },
  ]) {
    expect(storageProfileSchema.safeParse({ ...input, ...extra }).success).toBe(
      false,
    );
  }
  for (const url of [
    "http://sso.example/internal/storage/credential",
    "https://user:secret@sso.example/internal/storage/credential",
    "https://127.0.0.1/internal/storage/credential",
    "https://sso.example/wrong",
    profile.credentialsUrl + "?endpoint=other",
    profile.credentialsUrl + "#secret",
  ])
    expect(credentialsUrlSchema.safeParse(url).success).toBe(false);
  state.production = false;
  expect(
    credentialsUrlSchema.safeParse(
      "http://localhost:3000/internal/storage/credential",
    ).success,
  ).toBe(true);
});
it("does not contact any endpoint for malformed or disabled profiles", async () => {
  const fetch = transport();
  await expect(
    getStorageCredentials({ ...profile, enabled: false }),
  ).rejects.toThrow("storage_credentials_unavailable");
  await expect(
    getStorageCredentials({
      ...profile,
      credentialsUrl: "http://attacker.example",
    }),
  ).rejects.toThrow("storage_credentials_unavailable");
  expect(fetch).not.toHaveBeenCalled();
});
it("bounds private responses and rejects redirects, errors and non-JSON content", async () => {
  for (const response of [
    new Response("provider-private-body", { status: 401 }),
    new Response("private-html"),
    Response.json({ secret: "x".repeat(65536) }),
  ])
    await expect(readPrivateJson(response)).rejects.toThrow();
});
