// Bound private provider responses and never include their content in errors.
export async function readPrivateJson(response: Response): Promise<unknown> {
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json") ||
    Number(response.headers.get("content-length")) > 65536 ||
    !response.body
  ) {
    await response.body?.cancel();
    throw new Error("invalid_private_response");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new Error("invalid_private_response");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}
