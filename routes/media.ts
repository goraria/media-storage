import { Hono } from "hono";
import { actGetChatAssetUrl, actInspectChatAsset } from "@/controllers/chat";
import * as controller from "@/controllers/media";
import {
  actGetReaderAssetUrl,
  actInspectReaderAsset,
} from "@/controllers/reader";
import { actInspectReaderAssets } from "@/controllers/reader-inspect";
import {
  actGetSocialAssetUrl,
  actInspectSocialAsset,
} from "@/controllers/social";
import { actRegisterStorageProfile } from "@/controllers/storage-profile";
import { actGetTaskAssetUrl } from "@/controllers/task";
import { actGetVariantUrl } from "@/controllers/variant-url";
import {
  actGetVideoAssetUrl,
  actInspectVideoAsset,
  actPrepareVideoAsset,
} from "@/controllers/video";
import { requireAuth, requireRole } from "@/middlewares/auth";
import { requireChatWorker } from "@/middlewares/chat-worker";
import { requireReaderWorker } from "@/middlewares/reader-worker";
import { requireSocialWorker } from "@/middlewares/social-worker";
import { requireTaskWorker } from "@/middlewares/task-worker";
import { requireVideoWorker } from "@/middlewares/video-worker";

export const mediaRoutes = new Hono();

mediaRoutes.post("/chat/asset", requireChatWorker(), actInspectChatAsset);
mediaRoutes.post("/chat/asset-url", requireChatWorker(), actGetChatAssetUrl);
mediaRoutes.post("/reader/asset", requireReaderWorker(), actInspectReaderAsset);
mediaRoutes.post("/reader/asset-url", requireReaderWorker(), actGetReaderAssetUrl);
mediaRoutes.post("/reader/inspect", requireReaderWorker(), actInspectReaderAssets);
mediaRoutes.post("/social/asset", requireSocialWorker(), actInspectSocialAsset);
mediaRoutes.post("/social/asset-url", requireSocialWorker(), actGetSocialAssetUrl);
mediaRoutes.post("/task/asset-url", requireTaskWorker(), actGetTaskAssetUrl);
mediaRoutes.post("/video/delivery", requireVideoWorker(), actGetVideoAssetUrl);
mediaRoutes.post("/video/inspect", requireVideoWorker(), actInspectVideoAsset);
mediaRoutes.post("/video/prepare", requireVideoWorker(), actPrepareVideoAsset);
mediaRoutes.get("/asset/:id/url", requireAuth("read"), controller.actGetAssetUrl);
mediaRoutes.post(
  "/upload/:id/complete",
  requireAuth("write"),
  controller.actCompleteUpload,
);
mediaRoutes.post("/upload/:id/part", requireAuth("write"), controller.actCreateUploadPart);
mediaRoutes.get("/variant/:id/url", requireAuth("read"), actGetVariantUrl);
mediaRoutes.delete("/asset/:id", requireAuth("write"), controller.actDeleteAsset);
mediaRoutes.get("/asset/:id", requireAuth("read"), controller.actGetAsset);
mediaRoutes.patch("/asset/:id", requireAuth("write"), controller.actUpdateAsset);
mediaRoutes.delete(
  "/bucket/:id",
  requireAuth("write"),
  requireRole("master", "admin"),
  controller.actDeleteBucket,
);
mediaRoutes.get("/bucket/:id", requireAuth("read"), controller.actGetBucket);
mediaRoutes.patch(
  "/bucket/:id",
  requireAuth("write"),
  requireRole("master", "admin"),
  controller.actUpdateBucket,
);
mediaRoutes.get("/job/:id", requireAuth("read"), controller.actGetJob);
mediaRoutes.patch("/job/:id", requireAuth("write"), controller.actUpdateJob);
mediaRoutes.delete("/link/:id", requireAuth("write"), controller.actRevokeLink);
mediaRoutes.get("/link/:token", controller.actResolveLink);
mediaRoutes.get("/public/:id", controller.actRedirectPublicAsset);
mediaRoutes.delete("/upload/:id", requireAuth("write"), controller.actAbortUpload);
mediaRoutes.get("/upload/:id", requireAuth("read"), controller.actGetUpload);
mediaRoutes.delete("/variant/:id", requireAuth("write"), controller.actDeleteVariant);
mediaRoutes.get("/variant/:id", requireAuth("read"), controller.actGetVariant);
mediaRoutes.patch("/variant/:id", requireAuth("write"), controller.actUpdateVariant);
mediaRoutes.get("/asset", requireAuth("read"), controller.actListAsset);
mediaRoutes.get("/bucket", requireAuth("read"), controller.actListBucket);
mediaRoutes.post(
  "/bucket",
  requireAuth("write"),
  requireRole("master", "admin"),
  controller.actCreateBucket,
);
mediaRoutes.delete("/grant", requireAuth("write"), controller.actDeleteGrant);
mediaRoutes.get("/grant", requireAuth("read"), controller.actListGrant);
mediaRoutes.put("/grant", requireAuth("write"), controller.actUpsertGrant);
mediaRoutes.get("/job", requireAuth("read"), controller.actListJob);
mediaRoutes.post("/job", requireAuth("write"), controller.actCreateJob);
mediaRoutes.get("/link", requireAuth("read"), controller.actListLink);
mediaRoutes.post("/link", requireAuth("write"), controller.actCreateLink);
mediaRoutes.post(
  "/storage-profile",
  requireAuth("write"),
  requireRole("master"),
  actRegisterStorageProfile,
);
mediaRoutes.post("/upload", requireAuth("write"), controller.actCreateUpload);
mediaRoutes.get("/variant", requireAuth("read"), controller.actListVariant);
mediaRoutes.post("/variant", requireAuth("write"), controller.actCreateVariant);
