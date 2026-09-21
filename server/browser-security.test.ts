import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { clearLegacyPreviewStorage } from "../client/src/lib/legacy-storage";
import { securityHeaders } from "./_core/security";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); });
describe("browser security hardening", () => {
  it("removes only obsolete preview keys from both stores", () => {
    const removeItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { removeItem }, sessionStorage: { removeItem } });
    clearLegacyPreviewStorage();
    expect(removeItem.mock.calls).toEqual([["manus-runtime-user-info"], ["manus-cookie"], ["manus-runtime-user-info"], ["manus-cookie"]]);
  });
  it("tolerates blocked browser storage", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("blocked"); } });
    expect(clearLegacyPreviewStorage).not.toThrow();
  });
  it("sends privacy and browser defense headers", () => {
    const headers = new Map();
    securityHeaders({} as never, { removeHeader: vi.fn(), setHeader: (k: string, v: string) => headers.set(k, v) } as never, vi.fn());
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Permissions-Policy")).toBe('camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com")');
    expect(headers.get("Content-Security-Policy")).toContain("https://cdn.razorpay.com");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
  });
  it("does not inject preview runtime or eagerly load checkout", () => {
    const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
    expect(read("../vite.config.ts")).not.toContain("vitePluginManusRuntime");
    expect(read("../client/index.html")).not.toContain("checkout.js");
    expect(read("../client/src/main.tsx")).not.toContain("Bearer");
  });
  it("allows zoom and keeps privacy metadata in the document head", () => {
    const html = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"');
    expect(html).not.toMatch(/maximum-scale|user-scalable/);
    expect(html.split("</head>")[0]).toContain('name="referrer" content="no-referrer"');
  });
  it("registers only the renamed staff dashboard routes", () => {
    const routes = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    expect(routes).toContain('path="/maharaja" component={Admin}');
    expect(routes).toContain('path="/rasoi" component={Kitchen}');
    expect(routes).not.toMatch(/path="\/(admin|kitchen)"/);
  });
  it("deduplicates checkout script loads and resolves on SDK availability", async () => {
    const script: any = { remove: vi.fn() };
    const appendChild = vi.fn();
    const win: any = {};
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", { createElement: () => script, head: { appendChild } });
    const { loadRazorpay } = await import("../client/src/lib/razorpay-loader");
    const first = loadRazorpay();
    expect(loadRazorpay()).toBe(first);
    expect(appendChild).toHaveBeenCalledOnce();
    expect(script.src).toBe("https://checkout.razorpay.com/v1/checkout.js");
    expect(script.referrerPolicy).toBe("no-referrer");
    win.Razorpay = () => {};
    script.onload();
    await first;
  });
  it("times out failed loads and allows a retry", async () => {
    vi.useFakeTimers();
    const script: any = { remove: vi.fn() };
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { createElement: () => script, head: { appendChild: vi.fn() } });
    const { loadRazorpay } = await import("../client/src/lib/razorpay-loader");
    const result = expect(loadRazorpay()).rejects.toThrow("could not load");
    await vi.advanceTimersByTimeAsync(15000);
    await result;
    const retry = expect(loadRazorpay()).rejects.toThrow("could not load");
    script.onerror();
    await retry;
    expect(script.remove).toHaveBeenCalledTimes(2);
  });
});
