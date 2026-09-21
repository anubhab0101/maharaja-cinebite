import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(
  new URL("../client/public/sw.js", import.meta.url),
  "utf8"
);
function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const addAll = vi.fn().mockResolvedValue(undefined);
  const match = vi.fn().mockResolvedValue("offline document");
  const fetch = vi.fn().mockRejectedValue(new Error("offline"));
  vm.runInNewContext(source, {
    URL,
    fetch,
    caches: { open: async () => ({ addAll }), match },
    self: {
      location: { origin: "https://cinebite.store" },
      addEventListener: (name: string, cb: any) => {
        handlers[name] = cb;
      },
    },
  });
  return { handlers, addAll, match, fetch };
}
describe("privacy-safe PWA", () => {
  it("precaches only public offline assets", async () => {
    const w = worker();
    let pending: Promise<unknown> | undefined;
    w.handlers.install({
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await pending;
    expect(w.addAll).toHaveBeenCalledWith(["/offline.html", "/offline.css"]);
  });
  it("never intercepts API, mutation or third-party requests", () => {
    const w = worker();
    const respondWith = vi.fn();
    for (const [url, method] of [
      ["https://cinebite.store/api/trpc/kitchen.queue", "GET"],
      ["https://cinebite.store/rasoi", "POST"],
      ["https://example.com/script.js", "GET"],
    ]) {
      w.handlers.fetch({
        request: { url, method, mode: "navigate" },
        respondWith,
      });
    }
    expect(respondWith).not.toHaveBeenCalled();
  });
  it("returns an offline notice instead of a cached authenticated page", async () => {
    const w = worker();
    let pending: Promise<unknown> | undefined;
    w.handlers.fetch({
      request: {
        url: "https://cinebite.store/rasoi",
        method: "GET",
        mode: "navigate",
      },
      respondWith: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    expect(await pending).toBe("offline document");
    expect(w.match).toHaveBeenCalledWith("/offline.html");
  });
  it("has an installable standalone entry without privileged credentials", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../client/public/manifest.webmanifest", import.meta.url),
        "utf8"
      )
    );
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/rasoi");
    expect(manifest.icons.some((icon: any) => icon.sizes === "512x512")).toBe(
      true
    );
  });
});
