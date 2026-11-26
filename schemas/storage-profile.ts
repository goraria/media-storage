import { z } from "zod";
import { isProduction } from "@/utils/environment";

// Only trusted operators register this destination. Requests cannot override it.
export const credentialsUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return (
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === "/internal/storage/credential" &&
    ((url.protocol === "https:" &&
      !local &&
      !/^(\d+\.\d+\.\d+\.\d+|\[)/.test(url.hostname)) ||
      (!isProduction && local && url.protocol === "http:"))
  );
}, "A registered HTTPS application credential endpoint is required");

export const storageProfileSchema = z
  .object({
    bucketName: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,253}[a-z0-9]$/),
    endpoint: z.url().refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === "/" &&
        !/^(localhost|\d+\.\d+\.\d+\.\d+|\[)/.test(url.hostname)
      );
    }, "A public HTTPS S3 endpoint without path or credentials is required"),
    region: z.string().regex(/^[a-z0-9-]{1,64}$/),
    credentialsUrl: credentialsUrlSchema,
    enabled: z.boolean().default(true),
  })
  .strict();

export const storageCredentialsSchema = z
  .object({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    endpoint: z.url(),
    region: z.string().min(1),
    bucketName: z.string().min(1),
  })
  .strict();
export type StorageProfileInput = z.infer<typeof storageProfileSchema>;

export const machineTokenSchema = z.object({
  access_token: z.string().min(1).max(16384),
  token_type: z.literal("Bearer"),
  expires_in: z.number().positive().max(120),
});
