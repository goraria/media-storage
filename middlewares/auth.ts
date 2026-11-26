import type { ApiEnv } from "@/types/auth";
import type { MiddlewareHandler } from "hono";
import type { ApiContext } from "@/types/auth";
import {
  serviceAuthFailure,
  verifyServiceRequest,
} from "@/lib/auth/verification";
import { rawGetServiceUser } from "@/models/user";
import type { AuthContext } from "@/types/auth";
import type { ServiceAccess } from "@/utils/interface";
export function requireAuth(access: ServiceAccess): MiddlewareHandler<ApiEnv> {
  return createHonoRequestGuard<AuthContext>({
    async verify(request) {
      const verified = await verifyServiceRequest(request, access);
      const user = await rawGetServiceUser(
        verified.subject,
        request.headers.get("authorization")!.slice(7),
      );
      return {
        application: verified.application,
        clientId: verified.clientId,
        scopes: verified.scopes,
        sessionId: verified.sessionId,
        user,
      };
    },
    failure: serviceAuthFailure,
    assign(event, auth) {
      event.set("auth", auth);
    },
  });
}

export function requireRole(...roles: string[]): MiddlewareHandler<ApiEnv> {
  return async (context: ApiContext, next) => {
    if (!roles.includes(context.get("auth")!.user.role)) {
      return Response.json(
        { error: "forbidden" },
        {
          status: 403,
          headers: { "content-type": "application/json; charset=UTF-8" },
        },
      );
    }
    return await next();
  };
}

function createHonoRequestGuard<Auth>(options: {
  verify: (request: Request) => Promise<Auth>
  failure: (error: unknown) => Response
  assign: (context: ApiContext, identity: Auth) => void
}): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    let identity: Auth
    try {
      identity = await options.verify(context.req.raw)
    } catch (error) {
      return options.failure(error)
    }
    options.assign(context, identity)
    await next()
  }
}
