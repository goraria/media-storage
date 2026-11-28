import { createBackgroundQueue } from "@/modules/principle/queue";

export const {
  enqueueBackgroundJob,
  processBackgroundJob,
  plugin: backgroundQueuePlugin,
} = createBackgroundQueue("media-jobs", {
  drain: drainBackgroundJobs,
});

async function drainBackgroundJobs() {
  const { rawProcessNextJob: processNextJob } = await import("@/models/media-processing-job")
  // A transcode owns its bounded invocation; never run ten encodes in one Function.
  const result = await processNextJob()
  if ("status" in result && result.status === "retry_or_failed")
    throw new Error("Background delivery deferred")
  if (result.processed) await enqueueBackgroundJob()
}
