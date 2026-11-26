import type { ApiContext } from "@/types/auth";

export function actHealth(context: ApiContext) {
  return context.json(
    { status: "ok", service: "media-storage" },
    { headers: { "content-type": "application/json; charset=UTF-8" } },
  );
}
