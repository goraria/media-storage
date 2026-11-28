import { readRequestBody } from "@/modules/principle/request";
import type { Event } from "@/utils/interface";
import { videoAssetSchema, videoDeliverySchema } from "@/schemas/video";
import {
  rawPrepareVideoAsset as prepareVideoAssetServices,
  rawInspectVideoAsset as inspectVideoAssetServices,
  rawGetVideoAssetUrl as getVideoAssetUrlServices,
} from "@/services/video";
export async function actPrepareVideoAsset(e: Event) {
  const v = videoAssetSchema.parse(await readRequestBody(e.req));
  return e.json(
    await prepareVideoAssetServices(
      v.assetId,
      v.ownerExternalUserId,
      v.videoId,
    ),
  );
}
export async function actInspectVideoAsset(e: Event) {
  const v = videoAssetSchema.parse(await readRequestBody(e.req));
  return e.json(
    await inspectVideoAssetServices(
      v.assetId,
      v.ownerExternalUserId,
      v.videoId,
    ),
  );
}
export async function actGetVideoAssetUrl(e: Event) {
  const v = videoDeliverySchema.parse(await readRequestBody(e.req));
  return e.json(
    await getVideoAssetUrlServices(
      v.assetId,
      v.ownerExternalUserId,
      v.kind,
      v.videoId,
    ),
  );
}
