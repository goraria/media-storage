import { z } from "zod";
export const chatAssetSchema = z.object({
  assetId: z.uuid(),
  conversationId: z.uuid(),
  ownerExternalUserId: z.string().min(1).max(255).optional(),
});
