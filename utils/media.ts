import { randomUUID } from "node:crypto";

export function matchesImageSignature(bytes: Uint8Array, contentType: string) {
  const starts = (expected: number[]) =>
    expected.every((byte, index) => bytes[index] === byte);
  if (contentType === "image/png")
    return starts([137, 80, 78, 71, 13, 10, 26, 10]);
  if (contentType === "image/jpeg") return starts([255, 216, 255]);
  if (contentType === "image/gif")
    return (
      starts([71, 73, 70, 56]) &&
      [55, 57].includes(bytes[4]!) &&
      bytes[5] === 97
    );
  if (contentType === "image/webp")
    return (
      starts([82, 73, 70, 70]) &&
      [87, 69, 66, 80].every((byte, index) => bytes[index + 8] === byte)
    );
  return false;
}

function cleanSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function createObjectKey(input: {
  application: string;
  prefix: string;
  filename: string;
}) {
  const filename = cleanSegment(input.filename) || "file";
  return [input.prefix, input.application, randomUUID(), filename]
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

export function createDeliveryPath(assetId: string) {
  return `/media/public/${encodeURIComponent(assetId)}`;
}

/** Variant signing/deletion must never accept another asset's storage key. */
export function isProcessingObjectKey(sourceKey: string, key: string) {
  const prefix = `${sourceKey}.variant/`;
  return key.startsWith(prefix) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpg|mp4|mp3)$/i.test(key.slice(prefix.length));
}
