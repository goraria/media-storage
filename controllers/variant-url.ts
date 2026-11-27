import type { Event } from "@/utils/interface";
import { idParamsSchema } from "@/schemas/media";
import { rawGetVariantUrl as getVariantUrlServices } from "@/models/media-asset";

export async function actGetVariantUrl(context: Event) {
  return context.json(
    await getVariantUrlServices(
      idParamsSchema.parse(context.req.param()).id,
      context.get("auth")!,
    ),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
