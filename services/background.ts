import { QueueClient } from "@vercel/queue"
const queue = new QueueClient({ telemetry: { isEnabled: false } })
export async function enqueueBackgroundJob(kind: "drain" = "drain") {
  await queue.send("media-jobs", { kind })
}
async function drainBackgroundJobs() {
  const { rawProcessNextJob: processNextJob } = await import("@/models/media-processing-job")
  // A transcode owns its bounded invocation; never run ten encodes in one Function.
  const result = await processNextJob()
  if ("status" in result && result.status === "retry_or_failed")
    throw new Error("Background delivery deferred")
  if (result.processed) await enqueueBackgroundJob()
}
export async function processBackgroundJob(message: unknown) {
  const kind = message && typeof message === "object" ? (message as { kind?: unknown }).kind : undefined
  if (kind !== "drain") throw new Error("Invalid background job")
  await drainBackgroundJobs()
}
