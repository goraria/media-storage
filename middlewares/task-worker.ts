import type { Binding } from "@/utils/interface";
import type { MiddlewareHandler } from "hono";
import { verifyMachineRequest } from "@/lib/auth/machine";
import { serviceAuthFailure } from "@/lib/auth/verification";
export function requireTaskWorker(): MiddlewareHandler<Binding> {
  return async (event, next) => {
    try {
      await verifyMachineRequest(event.req.raw, "task:media:delegate");
    } catch (error) {
      return serviceAuthFailure(error);
    }
    return await next();
  };
}
