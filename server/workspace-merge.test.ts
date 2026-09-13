import { describe, expect, it, vi } from "vitest";
import { securityHeaders } from "./_core/security";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
describe("correct workspace merge safeguards", () => {
  it("preserves the repository's strict production security headers", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const headers = new Map<string, string>();
      securityHeaders({ headers: {}, secure: true } as never, { removeHeader: vi.fn(), setHeader: (key: string, value: string) => headers.set(key, value) } as never, vi.fn());
      const scripts = headers.get("Content-Security-Policy")!.split(";").find(part => part.includes("script-src"));
      expect(scripts).not.toContain("unsafe-inline");
      expect(scripts).not.toContain("unsafe-eval");
      const connections = headers.get("Content-Security-Policy")!.split(";").find(part => part.includes("connect-src"))!;
      expect(connections).not.toMatch(/\bwss?:/);
      expect(connections).toContain("'self'");
      expect(connections).toContain("https://api.razorpay.com");
      expect(connections).toContain("https://lumberjack.razorpay.com");
      expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
      expect(headers.has("Permissions-Policy")).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  });
  it("keeps Vite hot-reload WebSockets in development only", () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      const headers = new Map<string, string>();
      securityHeaders({} as never, { removeHeader: vi.fn(), setHeader: (key: string, value: string) => headers.set(key, value) } as never, vi.fn());
      const connections = headers.get("Content-Security-Policy")!.split(";").find(part => part.includes("connect-src"))!;
      expect(connections).toContain("wss: ws:");
    } finally { vi.unstubAllEnvs(); }
  });
  it("does not allow the old developer-code deletion to bypass retention", async () => {
    const caller = appRouter.createCaller({ user: { id: 1, role: "OWNER_ADMIN" }, req: { headers: {} }, res: {} } as unknown as TrpcContext);
    await expect(caller.admin.deleteOrder({ orderId: "order-test", developerCode: "anything" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
