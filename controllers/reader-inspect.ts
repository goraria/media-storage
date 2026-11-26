import { readRequestBody } from "@/utils/request";
import type { ApiContext } from "@/types/auth";
import { readerInspectSchema } from "@/schemas/reader-inspect";
import { rawInspectReaderAssets as inspectReaderAssetsServices } from "@/services/reader-inspect";
export async function actInspectReaderAssets(e: ApiContext) {
  const v = readerInspectSchema.parse(await readRequestBody(e.req));
  return e.json(
    await inspectReaderAssetsServices(v.assetIds, v.ownerExternalUserId),
  );
}
