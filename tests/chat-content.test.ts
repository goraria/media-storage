import { expect, it } from "vitest";
import { matchesChatSignature } from "@/utils/chat-media";
it("checks bytes instead of trusting a browser-supplied MIME header", () => {
  const text = (value: string) => new TextEncoder().encode(value);
  expect(matchesChatSignature(text("<html>payload</html>"), "image/png")).toBe(
    false,
  );
  expect(
    matchesChatSignature(text("%PDF-1.7 fixture"), "application/pdf"),
  ).toBe(true);
  expect(matchesChatSignature(text("OggS fixture"), "audio/ogg")).toBe(true);
  expect(
    matchesChatSignature(
      new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      "audio/webm",
    ),
  ).toBe(true);
  expect(
    matchesChatSignature(
      new Uint8Array([0, 0, 0, 12, 102, 116, 121, 112, 109, 112, 52, 50]),
      "video/mp4",
    ),
  ).toBe(true);
  expect(matchesChatSignature(text("ordinary text"), "text/plain")).toBe(true);
  expect(matchesChatSignature(text("MZ executable"), "text/plain")).toBe(false);
  expect(matchesChatSignature(text("plain"), "image/svg+xml")).toBe(false);
});
