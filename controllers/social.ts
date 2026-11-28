import { readRequestBody } from "@/modules/principle/request";
import type { Event } from "@/utils/interface";
import { socialAssetSchema } from "@/schemas/social";
import {
  rawInspectSocialAsset as inspectSocialAssetServices,
  rawGetSocialAssetUrl as getSocialAssetUrlServices,
} from "@/services/social";
export async function actInspectSocialAsset(e: Event) {
  const v = socialAssetSchema.parse(await readRequestBody(e.req));
  return e.json(
    await inspectSocialAssetServices(v.assetId, v.ownerExternalUserId),
  );
}
export async function actGetSocialAssetUrl(e: Event) {
  const v = socialAssetSchema.pick({ assetId: true }).parse(await readRequestBody(e.req));
  return e.json(await getSocialAssetUrlServices(v.assetId));
}
