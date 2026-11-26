import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve } from "node:path";

/** Verify the traced artifact, not the install tree: missing binaries must fail CI. */
export async function checkMediaArtifact(serverDir: string) {
  const root = resolve(serverDir);
  const require = createRequire(join(root, "index.mjs"));
  for (const name of ["ffmpeg-static", "@derhuerst/ffprobe-static"]) {
    const binary: string | null = require(name);
    if (!binary) throw new Error(`Unsupported binary platform: ${name}`);
    const location = relative(root, binary);
    if (isAbsolute(location) || location === ".." || location.startsWith("../"))
      throw new Error(`Binary is outside the deployment artifact: ${name}`);
    await access(binary, constants.X_OK);
    if (!(await stat(binary)).isFile()) throw new Error(`Missing executable: ${name}`);
  }
  let bytes = 0;
  for (const file of await readdir(root, { recursive: true })) {
    const entry = await stat(join(root, file));
    if (entry.isFile()) bytes += entry.size;
  }
  // Use the standard Function budget; no dependency on the large-functions beta.
  if (bytes > 250_000_000) throw new Error("Media Function exceeds the 250 MB artifact budget");
  console.info(`[media] Executables verified; unpacked server artifact ${(bytes / 1_000_000).toFixed(1)} MB`);
}
