import { defineConfig } from "nitro";
import { port } from "./utils/environment";
import { checkMediaArtifact } from "./configs/media-build";

export default defineConfig({
  // Preserve standard Response cloning/status through middleware and compression.
  // Nitro's current srvx FastResponse loses status when a Response is used as init.
  features: { fastResponse: false },
  // Select native Vercel Queue delivery in both dev and production.
  preset: "vercel",
  buildDir: ".nitro",
  serverDir: "./app",
  scanDirs: ["."],
  ignore: ["routes/**"],
  // The packages resolve executables relative to themselves, so preserve their files and modes.
  traceDeps: ["ffmpeg-static*", "@derhuerst/ffprobe-static*"],
  traceOpts: { chmod: true },
  hooks: { compiled: (nitro) => checkMediaArtifact(nitro.options.output.serverDir) },
  // Explicit registration keeps global middleware active outside Nitro's default directory.
  handlers: [
    { route: "/**", middleware: true, handler: "./middlewares/background.ts" },
    { route: "/**", middleware: true, handler: "./middlewares/00.http.ts" },
    { route: "/**", middleware: true, handler: "./middlewares/01.errors.ts" },
  ],
  errorHandler: "./app/error.ts",
  alias: { "@": import.meta.dirname },
  devServer: { port: Number(port) || 5057, hostname: "0.0.0.0" },
  experimental: { tasks: true },
  // Vercel Hobby supports daily cron schedules.
  scheduledTasks: { "0 0 * * *": "background:recover" },
  vercel: {
    entryFormat: "web",
    // Leave room for bounded storage I/O and probing around the 120-second encode.
    // Keep below the existing ten-minute DB lease; requires a Pro/Enterprise duration limit.
    functions: { runtime: "nodejs24.x", maxDuration: 540 },
    queues: { triggers: [{ topic: "media-jobs", retryAfterSeconds: 60 }] },
  },
});
