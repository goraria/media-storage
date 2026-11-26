import { matchesImageSignature } from "@/utils/media";
/** Basic content sniffing, not an antivirus or a complete media decoder. */
export function matchesChatSignature(bytes: Uint8Array, contentType: string) {
  if (contentType.startsWith("image/"))
    return matchesImageSignature(bytes, contentType);
  const prefix = (value: string, offset = 0) =>
    [...value].every(
      (char, index) => bytes[offset + index] === char.charCodeAt(0),
    );
  if (contentType === "application/pdf") return prefix("%PDF-");
  if (contentType === "audio/ogg") return prefix("OggS");
  if (contentType === "audio/webm" || contentType === "video/webm")
    return [0x1a, 0x45, 0xdf, 0xa3].every(
      (byte, index) => bytes[index] === byte,
    );
  if (contentType === "audio/mp4" || contentType === "video/mp4")
    return bytes.length >= 12 && prefix("ftyp", 4);
  if (contentType === "text/plain")
    return (
      bytes.length > 0 &&
      !bytes.includes(0) &&
      !prefix("MZ") &&
      !prefix("\x7fELF")
    );
  return false;
}
