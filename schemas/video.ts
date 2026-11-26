import { z } from "zod";
export const videoAssetSchema = z
  .object({
    assetId: z.uuid(),
    videoId: z.uuid(),
    ownerExternalUserId: z.string().min(1).max(255),
  })
  .strict();
export const videoDeliverySchema = videoAssetSchema.extend({
  kind: z.enum(["transcode", "thumbnail"]).default("transcode"),
});
