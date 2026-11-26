import { readRequestBody } from "@/utils/request";
import type { ApiContext } from "@/types/auth";
import { videoAssetSchema, videoDeliverySchema } from "@/schemas/video";
import {
  rawPrepareVideoAsset as prepareVideoAssetServices,
  rawInspectVideoAsset as inspectVideoAssetServices,
  rawGetVideoAssetUrl as getVideoAssetUrlServices,
} from "@/services/video";
export async function actPrepareVideoAsset(e: ApiContext) {
  const v = videoAssetSchema.parse(await readRequestBody(e.req));
  return e.json(
    await prepareVideoAssetServices(
      v.assetId,
      v.ownerExternalUserId,
      v.videoId,
    ),
  );
}
export async function actInspectVideoAsset(e: ApiContext) {
  const v = videoAssetSchema.parse(await readRequestBody(e.req));
  return e.json(
    await inspectVideoAssetServices(
      v.assetId,
      v.ownerExternalUserId,
      v.videoId,
    ),
  );
}
export async function actGetVideoAssetUrl(e: ApiContext) {
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
