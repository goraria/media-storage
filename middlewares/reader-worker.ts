import type { ApiEnv } from "@/types/auth";
import type { MiddlewareHandler } from "hono";
import { verifyMachineRequest } from "@/lib/auth/machine";
import { serviceAuthFailure } from "@/lib/auth/verification";
export function requireReaderWorker(): MiddlewareHandler<ApiEnv> {
  return async (e, next) => {
    try {
      await verifyMachineRequest(e.req.raw, "reader:media:delegate");
    } catch (error) {
      return serviceAuthFailure(error);
    }
    return next();
  };
}
