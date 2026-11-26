import { readRequestBody } from "@/utils/request";
import type { ApiContext } from "@/types/auth";
import { socialAssetSchema } from "@/schemas/social";
import {
  rawInspectSocialAsset as inspectSocialAssetServices,
  rawGetSocialAssetUrl as getSocialAssetUrlServices,
} from "@/services/social";
export async function actInspectSocialAsset(e: ApiContext) {
  const v = socialAssetSchema.parse(await readRequestBody(e.req));
  return e.json(
    await inspectSocialAssetServices(v.assetId, v.ownerExternalUserId),
  );
}
export async function actGetSocialAssetUrl(e: ApiContext) {
  const v = socialAssetSchema.pick({ assetId: true }).parse(await readRequestBody(e.req));
  return e.json(await getSocialAssetUrlServices(v.assetId));
}
