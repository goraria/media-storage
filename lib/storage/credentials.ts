import { createMachineTokenRequest } from "@gorth-com/structure/modules/auth/server";
import { getApplicationOrigin } from "@/modules/structure/sso-directory";
import {
  authUrl,
  isProduction,
  oauthClientId,
  oauthClientSecret,
} from "@/utils/environment";
import {
  storageCredentialsSchema,
  storageProfileSchema,
  machineTokenSchema,
} from "@/schemas/storage-profile";
import { ServiceError } from "@/lib/errors";
import type { mediaStorageProfile } from "@/database/schema";
import { readPrivateJson } from "@/utils/private-response";

// Never accept credentials/endpoints from upload requests. No persistent secret cache.
export async function getStorageCredentials(
  profile: typeof mediaStorageProfile.$inferSelect,
) {
  try {
    const registered = storageProfileSchema.parse({
      bucketName: profile.bucketName,
      endpoint: profile.endpoint,
      region: profile.region,
      credentialsUrl: profile.credentialsUrl,
      enabled: profile.enabled,
    });
    if (
      !registered.enabled ||
      !/^[a-z]+$/.test(profile.application) ||
      !authUrl ||
      !oauthClientId ||
      !oauthClientSecret
    )
      throw new Error();
    const authority = new URL(authUrl);
    if (
      authority.username ||
      authority.password ||
      authority.search ||
      authority.hash ||
      authority.pathname !== "/" ||
      !(
        authority.protocol === "https:" ||
        (!isProduction &&
          authority.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(authority.hostname))
      )
    )
      throw new Error();
    const scope = `storage:${profile.application}:credential`;
    // The owning origin comes from SSO, never from a stored/user-supplied profile URL.
    registered.credentialsUrl = new URL(
      "/internal/storage/credential",
      await getApplicationOrigin(profile.application),
    ).href;
    // Better Auth owns client authentication, scope ceiling and token issuance.
    const tokenEndpoint = new URL("/auth/oauth2/token", authority).href;
    const grant = await createMachineTokenRequest({
      clientId: oauthClientId,
      clientSecret: oauthClientSecret,
      allowLoopbackHttp: !isProduction,
      tokenEndpoint,
      method: "client_secret_basic",
      scopes: [scope],
      resources: [registered.credentialsUrl],
    });
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: grant.headers,
      body: grant.body,
    });
    const token = machineTokenSchema.parse(await readPrivateJson(response));
    const result = await fetch(registered.credentialsUrl, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bucketName: registered.bucketName }),
    });
    const credentials = storageCredentialsSchema.parse(
      await readPrivateJson(result),
    );
    if (
      new URL(credentials.endpoint).origin !==
        new URL(registered.endpoint).origin ||
      credentials.region !== registered.region ||
      credentials.bucketName !== registered.bucketName
    )
      throw new Error();
    return {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    };
  } catch {
    // Fetch/provider exceptions can contain tokens or storage credentials.
    throw new ServiceError("storage_credentials_unavailable", 503);
  }
}
