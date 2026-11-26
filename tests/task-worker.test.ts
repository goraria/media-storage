import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/lib/auth/machine", () => ({ verifyMachineRequest: state.verify }));
vi.mock("@/lib/auth/verification", () => ({
  serviceAuthFailure: () => Response.json({ error: "denied" }, { status: 403 }),
}));
import { requireTaskWorker } from "@/middlewares/task-worker";
beforeEach(() => vi.resetAllMocks());
it("uses the central OAuth machine scope instead of an app-specific client env list", async () => {
  const request = new Request("https://service.example.test/task", {
    headers: { Authorization: "Bearer machine" },
  });
  const next = vi.fn(async () => new Response("ok"));
  const response = await requireTaskWorker()(
    { req: { raw: request } } as never,
    next as never,
  );
  expect((response as Response).status).toBe(200);
  expect(state.verify).toHaveBeenCalledWith(request, "task:media:delegate");
});
it("fails closed before executing the handler", async () => {
  state.verify.mockRejectedValue(new Error("denied"));
  const next = vi.fn();
  const response = await requireTaskWorker()(
    { req: new Request("https://service.example.test/task") } as never,
    next as never,
  );
  expect((response as Response).status).toBe(403);
  expect(next).not.toHaveBeenCalled();
});
