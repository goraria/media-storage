import { z } from "zod";
export const taskAssetSchema = z.object({
  assetId: z.uuid(),
  pageId: z.uuid(),
});
