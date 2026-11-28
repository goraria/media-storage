import type { Binding } from "@/utils/interface";
import type { MiddlewareHandler } from "hono";
import { verifyMachineRequest } from "@/lib/auth/machine";
import { serviceAuthFailure } from "@/lib/auth/verification";
export function requireSocialWorker(): MiddlewareHandler<Binding> {
  return async (e, next) => {
    try {
      await verifyMachineRequest(e.req.raw, "social:media:delegate");
    } catch (error) {
      return serviceAuthFailure(error, e.req.raw);
    }
    return next();
  };
}
