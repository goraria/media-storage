import { readRequestBody } from "@/utils/request";
import type { ApiContext } from "@/types/auth";

import { storageProfileSchema } from "@/schemas/storage-profile";
import { rawRegisterStorageProfile as registerStorageProfileServices } from "@/models/media-storage-profile";
export async function actRegisterStorageProfile(context: ApiContext) {
  const input = storageProfileSchema.parse(await readRequestBody(context.req));
  return context.json(
    await registerStorageProfileServices(input, context.get("auth")!),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    },
  );
}
