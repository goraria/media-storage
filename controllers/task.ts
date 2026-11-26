import { readRequestBody } from "@/utils/request";
import type { ApiContext } from "@/types/auth";
import { taskAssetSchema } from "@/schemas/task";
import { rawGetTaskAssetUrl as getTaskAssetUrlServices } from "@/models/media-asset";
export async function actGetTaskAssetUrl(event: ApiContext) {
  const input = taskAssetSchema.parse(await readRequestBody(event.req));
  return event.json(
    await getTaskAssetUrlServices(input.assetId, input.pageId),
  );
}
