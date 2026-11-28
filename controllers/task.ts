import { readRequestBody } from "@/modules/principle/request";
import type { Event } from "@/utils/interface";
import { taskAssetSchema } from "@/schemas/task";
import { rawGetTaskAssetUrl as getTaskAssetUrlServices } from "@/models/media-asset";
export async function actGetTaskAssetUrl(event: Event) {
  const input = taskAssetSchema.parse(await readRequestBody(event.req));
  return event.json(
    await getTaskAssetUrlServices(input.assetId, input.pageId),
  );
}
