import { z } from "zod";
export const socialAssetSchema = z.object({
  assetId: z.uuid(),
  ownerExternalUserId: z.string().min(1).max(255),
});
