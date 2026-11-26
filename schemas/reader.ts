import { z } from "zod";
export const readerAssetSchema = z.object({
  assetId: z.uuid(),
  ownerExternalUserId: z.string().min(1).max(255),
});
