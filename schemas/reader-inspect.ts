import { z } from "zod";
export const readerInspectSchema = z
  .object({
    assetIds: z.array(z.uuid()).min(1).max(400),
    ownerExternalUserId: z.string().min(1).max(255).optional(),
  })
  .strict();
