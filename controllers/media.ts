import type { Event } from "@/utils/interface";
import { getQueryValues, readRequestBody } from "@/modules/principle/request";
import {
  assetUrlSchema,
  completeUploadSchema,
  createBucketSchema,
  createJobSchema,
  createLinkSchema,
  createUploadSchema,
  createVariantSchema,
  grantSchema,
  idParamsSchema,
  listAssetSchema,
  listGrantSchema,
  listJobSchema,
  listLinkSchema,
  listVariantSchema,
  updateAssetSchema,
  updateBucketSchema,
  updateJobSchema,
  updateVariantSchema,
  uploadPartSchema,
  tokenParamsSchema,
} from "@/schemas/media";
import * as mediaService from "@/models/media-asset";

type Session = Event;
export async function actListBucket(context: Session) {
  return context.json(await mediaService.rawListBuckets(context.get("auth")!), {
    headers: { "content-type": "application/json; charset=UTF-8" },
  });
}
export async function actCreateBucket(context: Session) {
  const input = createBucketSchema.parse(await readRequestBody(context.req));
  return context.json(
    await mediaService.rawCreateBucket(input, context.get("auth")!),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    },
  );
}
export async function actGetBucket(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  return context.json(
    await mediaService.rawGetMediaBucket(id, context.get("auth")!),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
export async function actUpdateBucket(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  const input = updateBucketSchema.parse(await readRequestBody(context.req));
  return context.json(
    await mediaService.rawUpdateBucket(id, input, context.get("auth")!),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
export async function actDeleteBucket(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  await mediaService.rawDeleteBucket(id, context.get("auth")!);
  return new Response(null, { status: 204 });
}
export async function actListAsset(context: Session) {
  const input = listAssetSchema.parse(getQueryValues(context.req.raw));
  return context.json(
    await mediaService.rawListAssets(input, context.get("auth")!),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
export async function actGetAsset(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  return context.json(await mediaService.rawGetAsset(id, context.get("auth")!), {
    headers: { "content-type": "application/json; charset=UTF-8" },
  });
}
export async function actUpdateAsset(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  const input = updateAssetSchema.parse(await readRequestBody(context.req));
  return context.json(
    await mediaService.rawUpdateAsset(id, input, context.get("auth")!),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
export async function actDeleteAsset(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  await mediaService.rawDeleteAsset(id, context.get("auth")!);
  return new Response(null, { status: 204 });
}
export async function actGetAssetUrl(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  const input = assetUrlSchema.parse(getQueryValues(context.req.raw));
  context.header("Cache-Control", "no-store");
  return context.json(
    await mediaService.rawGetAssetUrl(id, input, context.get("auth")!),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
export async function actRedirectPublicAsset(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  context.header("Cache-Control", "private, no-store");
  return context.redirect(await mediaService.rawGetPublicAssetUrl(id), 307);
}
export async function actCreateUpload(context: Session) {
  const input = createUploadSchema.parse(await readRequestBody(context.req));
  context.header("Cache-Control", "no-store");
  return context.json(
    await mediaService.rawCreateUpload(input, context.get("auth")!),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    },
  );
}
export async function actGetUpload(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  return context.json(
    await mediaService.rawGetUpload(id, context.get("auth")!),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
export async function actCreateUploadPart(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  const input = uploadPartSchema.parse(await readRequestBody(context.req));
  context.header("Cache-Control", "no-store");
  return context.json(
    await mediaService.rawCreateUploadPart(id, input, context.get("auth")!),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    },
  );
}
export async function actCompleteUpload(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  const input = completeUploadSchema.parse(await readRequestBody(context.req));
  return context.json(
    await mediaService.rawCompleteUpload(id, input, context.get("auth")!),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
export async function actAbortUpload(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  await mediaService.rawAbortUpload(id, context.get("auth")!);
  return new Response(null, { status: 204 });
}
export async function actListVariant(context: Session) {
  const input = listVariantSchema.parse(getQueryValues(context.req.raw));
  return context.json(
    await mediaService.rawListVariants(input, context.get("auth")!),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
export async function actCreateVariant(context: Session) {
  const input = createVariantSchema.parse(await readRequestBody(context.req));
  return context.json(
    await mediaService.rawCreateVariant(input, context.get("auth")!),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    },
  );
}
export async function actGetVariant(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  return context.json(
    await mediaService.rawGetVariant(id, context.get("auth")!),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
export async function actUpdateVariant(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  const input = updateVariantSchema.parse(await readRequestBody(context.req));
  return context.json(
    await mediaService.rawUpdateVariant(id, input, context.get("auth")!),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
export async function actDeleteVariant(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  await mediaService.rawDeleteVariant(id, context.get("auth")!);
  return new Response(null, { status: 204 });
}
export async function actListJob(context: Session) {
  const input = listJobSchema.parse(getQueryValues(context.req.raw));
  return context.json(
    await mediaService.rawListJobs(input, context.get("auth")!),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
export async function actCreateJob(context: Session) {
  const input = createJobSchema.parse(await readRequestBody(context.req));
  return context.json(
    await mediaService.rawCreateJob(input, context.get("auth")!),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    },
  );
}
export async function actGetJob(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  return context.json(await mediaService.rawGetJob(id, context.get("auth")!), {
    headers: { "content-type": "application/json; charset=UTF-8" },
  });
}
export async function actUpdateJob(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  const input = updateJobSchema.parse(await readRequestBody(context.req));
  return context.json(
    await mediaService.rawUpdateJob(id, input, context.get("auth")!),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
export async function actListGrant(context: Session) {
  const input = listGrantSchema.parse(getQueryValues(context.req.raw));
  return context.json(
    await mediaService.rawListGrants(input, context.get("auth")!),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
export async function actUpsertGrant(context: Session) {
  const input = grantSchema.parse(await readRequestBody(context.req));
  return context.json(
    await mediaService.rawUpsertGrant(input, context.get("auth")!),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    },
  );
}
export async function actDeleteGrant(context: Session) {
  const input = grantSchema.parse(await readRequestBody(context.req));
  await mediaService.rawDeleteGrant(input, context.get("auth")!);
  return new Response(null, { status: 204 });
}
export async function actListLink(context: Session) {
  const input = listLinkSchema.parse(getQueryValues(context.req.raw));
  return context.json(
    await mediaService.rawListLinks(input, context.get("auth")!),
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
export async function actCreateLink(context: Session) {
  const input = createLinkSchema.parse(await readRequestBody(context.req));
  context.header("Cache-Control", "no-store");
  return context.json(
    await mediaService.rawCreateLink(input, context.get("auth")!),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    },
  );
}
export async function actResolveLink(context: Session) {
  const { token } = tokenParamsSchema.parse(context.req.param());
  context.header("Cache-Control", "private, no-store");
  return context.redirect(await mediaService.rawResolveLink(token), 307);
}
export async function actRevokeLink(context: Session) {
  const { id } = idParamsSchema.parse(context.req.param());
  await mediaService.rawRevokeLink(id, context.get("auth")!);
  return new Response(null, { status: 204 });
}
