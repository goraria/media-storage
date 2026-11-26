import type { ApiEnv } from "@/types/auth";
import type { MiddlewareHandler } from "hono";
import { verifyMachineRequest } from "@/lib/auth/machine";
import { serviceAuthFailure } from "@/lib/auth/verification";
export function requireTaskWorker(): MiddlewareHandler<ApiEnv> {
  return async (event, next) => {
    try {
      await verifyMachineRequest(event.req.raw, "task:media:delegate");
    } catch (error) {
      return serviceAuthFailure(error);
    }
    return await next();
  };
}
