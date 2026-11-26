import { Hono } from "hono";
import { defineHandler } from "nitro";
import { routeNotFound } from "@/app/error";
import { sharedRoutes } from "@/routes/shared";
import { mediaRoutes } from "@/routes/media";

export const router = new Hono();
router.onError((error) => { throw error });
router.notFound((context) => routeNotFound(context.req.raw));
router.route("/", sharedRoutes);
router.route("/media", mediaRoutes);

export default defineHandler((event) => router.fetch(event.req));
