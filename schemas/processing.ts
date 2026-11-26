import { z } from "zod";

export const processingInputSchema = z
  .object({
    width: z.number().int().min(16).max(4096).default(1280),
    height: z.number().int().min(16).max(4096).default(720),
    format: z.enum(["webp", "png", "jpg", "mp4", "mp3"]).optional(),
    second: z.number().finite().min(0).max(7200).default(0),
  })
  .strict();
export const executableJobTypes = [
  "resize",
  "crop",
  "optimize",
  "transcode",
  "thumbnail",
  "preview",
  "convert",
  "extract",
] as const;
export type ProcessingInput = z.infer<typeof processingInputSchema>;
