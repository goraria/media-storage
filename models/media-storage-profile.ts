import { and, eq } from "drizzle-orm";
import { database } from "@/database";
import { mediaStorageProfile } from "@/database/schema";
import { ServiceError } from "@/lib/errors";
import { getApplicationOrigin } from "@/utils/sso-directory";
import {
  storageProfileSchema,
  type StorageProfileInput,
} from "@/schemas/storage-profile";
import type { AuthContext } from "@/types/auth";

export async function rawGetStorageProfile(
  application: string,
  bucketName: string,
) {
  const [profile] = await database
    .select()
    .from(mediaStorageProfile)
    .where(
      and(
        eq(mediaStorageProfile.application, application),
        eq(mediaStorageProfile.bucketName, bucketName),
        eq(mediaStorageProfile.enabled, true),
      ),
    )
    .limit(1);
  if (!profile) throw new ServiceError("storage_profile_not_configured", 503);
  const valid = storageProfileSchema.safeParse({
    bucketName: profile.bucketName,
    endpoint: profile.endpoint,
    region: profile.region,
    credentialsUrl: profile.credentialsUrl,
    enabled: profile.enabled,
  });
  if (!valid.success) throw new ServiceError("invalid_storage_profile", 503);
  return profile;
}

export async function rawRegisterStorageProfile(
  input: StorageProfileInput,
  auth: AuthContext,
) {
  const credentialsUrl = new URL(
    "/internal/storage/credential", await getApplicationOrigin(auth.application),
  ).href;
  const [profile] = await database
    .insert(mediaStorageProfile)
    .values({
      ...input,
      credentialsUrl,
      application: auth.application,
    })
    .onConflictDoUpdate({
      target: [mediaStorageProfile.application, mediaStorageProfile.bucketName],
      set: { ...input, credentialsUrl, updatedAt: new Date() },
    })
    .returning();
  if (!profile)
    throw new ServiceError("storage_profile_registration_failed", 409);
  return profile;
}
