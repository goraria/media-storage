import { readRequestBody } from "@/utils/request";
import type { Event } from "@/utils/interface";
import { HTTPError } from "nitro/h3";
import { chatAssetSchema } from "@/schemas/chat";
import {
  rawInspectChatAsset as inspectChatAssetServices,
  rawGetChatAssetUrl as getChatAssetUrlServices,
} from "@/services/chat";
export async function actInspectChatAsset(event: Event) {
  const input = chatAssetSchema.parse(await readRequestBody(event.req));
  if (!input.ownerExternalUserId)
    throw new HTTPError({ status: 400, message: "owner_required" });
  return event.json(
    await inspectChatAssetServices(
      input.assetId,
      input.conversationId,
      input.ownerExternalUserId,
    ),
  );
}
export async function actGetChatAssetUrl(event: Event) {
  const input = chatAssetSchema.parse(await readRequestBody(event.req));
  return event.json(
    await getChatAssetUrlServices(input.assetId, input.conversationId),
  );
}
