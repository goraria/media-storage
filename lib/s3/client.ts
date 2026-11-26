import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { rawGetStorageProfile } from "@/models/media-storage-profile";
import { getStorageCredentials } from "@/lib/storage/credentials";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export async function downloadProcessingObject(application: string, bucket: string, key: string, filename: string) {
  return useS3Client(application, bucket, async (client) => {
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(60_000) });
    const maxBytes = 512 * 1024 * 1024;
    if (!object.Body || !object.ContentLength || object.ContentLength > maxBytes) throw new Error("processing_object_too_large");
    let bytes = 0;
    const limit = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > maxBytes ? new Error("processing_object_too_large") : null, chunk);
    } });
    await pipeline(Readable.fromWeb(object.Body.transformToWebStream() as never), limit, createWriteStream(filename, { flags: "wx" }), { signal: AbortSignal.timeout(60_000) });
  });
}

export async function uploadProcessingObject(application: string, bucket: string, key: string, filename: string, contentType: string) {
  const { size } = await stat(filename);
  if (size <= 0 || size > 512 * 1024 * 1024) throw new Error("processing_output_too_large");
  const body = createReadStream(filename);
  try {
    await useS3Client(application, bucket, (client) => client.send(new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: size, Body: body }), { abortSignal: AbortSignal.timeout(60_000) }));
  } finally { body.destroy(); }
  return size;
}

export async function getS3Client(application: string, bucket: string) {
  const profile = await rawGetStorageProfile(application, bucket);
  const credentials = await getStorageCredentials(profile);
  return new S3Client({
    endpoint: profile.endpoint,
    region: profile.region,
    forcePathStyle: true,
    credentials,
    // The PUT body arrives later from the browser. Do not presign a checksum
    // computed from the absent body; required provider checksums remain enabled.
    requestChecksumCalculation: "WHEN_REQUIRED",
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 3_000, requestTimeout: 10_000 },
  });
}

async function useS3Client<T>(
  application: string,
  bucket: string,
  operation: (client: S3Client) => Promise<T>,
) {
  const client = await getS3Client(application, bucket);
  try {
    return await operation(client);
  } finally {
    client.destroy();
  }
}

export async function createUploadUrl(input: {
  application: string;
  bucket: string;
  key: string;
  contentType: string;
  size?: number;
  expiresIn?: number;
}) {
  return useS3Client(input.application, input.bucket, (client) =>
    getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.size,
      }),
      {
        expiresIn: input.expiresIn ?? 900,
        signableHeaders: new Set(["content-type"]),
      },
    ),
  );
}

export async function createDownloadUrl(input: {
  application: string;
  bucket: string;
  key: string;
  filename?: string | null;
  expiresIn?: number;
}) {
  return useS3Client(input.application, input.bucket, (client) =>
    getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        ResponseContentDisposition: input.filename
          ? `inline; filename*=UTF-8''${encodeURIComponent(input.filename)}`
          : undefined,
      }),
      { expiresIn: input.expiresIn ?? 900 },
    ),
  );
}

export async function headObject(
  bucket: string,
  key: string,
  application: string,
) {
  return useS3Client(application, bucket, (client) =>
    client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
  );
}

export async function readObjectPrefix(
  bucket: string,
  key: string,
  application: string,
) {
  return useS3Client(application, bucket, async (client) => {
    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-15" }),
    );
    if (!object.Body) throw new Error("missing_object_body");
    return object.Body.transformToByteArray();
  });
}

export async function headBucket(bucket: string, application: string) {
  return useS3Client(application, bucket, (client) =>
    client.send(new HeadBucketCommand({ Bucket: bucket })),
  );
}

export async function deleteObject(
  bucket: string,
  key: string,
  application: string,
) {
  return useS3Client(application, bucket, (client) =>
    client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
  );
}

export async function beginMultipartUpload(input: {
  application: string;
  bucket: string;
  key: string;
  contentType: string;
}) {
  return useS3Client(input.application, input.bucket, (client) =>
    client.send(
      new CreateMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.key,
        ContentType: input.contentType,
      }),
    ),
  );
}

export async function createMultipartPartUrl(input: {
  application: string;
  bucket: string;
  key: string;
  uploadId: string;
  partNumber: number;
  expiresIn?: number;
}) {
  return useS3Client(input.application, input.bucket, (client) =>
    getSignedUrl(
      client,
      new UploadPartCommand({
        Bucket: input.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
      }),
      { expiresIn: input.expiresIn ?? 900 },
    ),
  );
}

export async function completeMultipartUpload(input: {
  application: string;
  bucket: string;
  key: string;
  uploadId: string;
  parts: CompletedPart[];
}) {
  return useS3Client(input.application, input.bucket, (client) =>
    client.send(
      new CompleteMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        MultipartUpload: { Parts: input.parts },
      }),
    ),
  );
}

export async function abortMultipartUpload(input: {
  application: string;
  bucket: string;
  key: string;
  uploadId: string;
}) {
  return useS3Client(input.application, input.bucket, (client) =>
    client.send(
      new AbortMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.key,
        UploadId: input.uploadId,
      }),
    ),
  );
}
