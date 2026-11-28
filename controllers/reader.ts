import { readRequestBody } from "@/modules/principle/request";
import type { Event } from "@/utils/interface";
import { readerAssetSchema } from "@/schemas/reader";
import {
  rawInspectReaderAsset as inspectReaderAssetServices,
  rawGetReaderAssetUrl as getReaderAssetUrlServices,
} from "@/services/reader";
export async function actInspectReaderAsset(e: Event) {
  const v = readerAssetSchema.parse(await readRequestBody(e.req));
  return e.json(
    await inspectReaderAssetServices(v.assetId, v.ownerExternalUserId),
  );
}
export async function actGetReaderAssetUrl(e: Event) {
  const v = readerAssetSchema.pick({ assetId: true }).parse(await readRequestBody(e.req));
  return e.json(await getReaderAssetUrlServices(v.assetId));
}
