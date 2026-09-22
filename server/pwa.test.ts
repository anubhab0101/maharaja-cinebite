import { readFileSync } from "node:fs";
import vm from "node:vm";
import { staffManifest } from "../shared/staff-manifest";
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
  const showNotification = vi.fn().mockResolvedValue(undefined);
  vm.runInNewContext(source, {
    URL,
    fetch,
    caches: { open: async () => ({ addAll }), match },
    self: {
      registration: { showNotification },
      location: { origin: "https://cinebite.store" },
      addEventListener: (name: string, cb: any) => {
        handlers[name] = cb;
      },
    },
  });
  return { handlers, addAll, match, fetch, showNotification };
}
describe("privacy-safe PWA", () => {
  it("renders only bounded offer text and ignores supplied redirect URLs", async () => {
    const w = worker();
    let task: Promise<unknown> | undefined;
    w.handlers.push({
      data: {
        json: () => ({
          type: "offer",
          title: "a".repeat(100),
          body: "b".repeat(300),
          url: "https://evil.test",
          campaignId: "test",
        }),
      },
      waitUntil: (p: Promise<unknown>) => {
        task = p;
      },
    });
    await task;
    expect(w.showNotification).toHaveBeenCalledWith(
      "a".repeat(60),
      expect.objectContaining({
        body: "b".repeat(180),
        data: { kind: "offer" },
      })
    );
    expect(JSON.stringify(w.showNotification.mock.calls)).not.toContain(
      "evil.test"
    );
  });
  it("ignores malformed/unrelated push payloads", () => {
    const w = worker();
    w.handlers.push({
      data: {
        json: () => {
          throw new Error("bad payload");
        },
      },
    });
    w.handlers.push({
      data: {
        json: () => ({ type: "arbitrary", title: "Test", body: "Test" }),
      },
    });
    expect(w.showNotification).not.toHaveBeenCalled();
  });
  it("renders staff push with fixed privacy-safe content", async () => {
    const w = worker(); let task: Promise<unknown> | undefined;
    w.handlers.push({ data: { json: () => ({ type: "staff-order", notificationId: "abc", title: "private name", body: "private phone" }) }, waitUntil: (p: Promise<unknown>) => { task = p; } });
    await task;
    expect(w.showNotification).toHaveBeenCalledWith("CineBite: New order arrives", expect.objectContaining({ data: { kind: "staff" }, tag: "staff-abc" }));
    expect(JSON.stringify(w.showNotification.mock.calls)).not.toContain("private");
  });
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
    const manifest = staffManifest;
    const html = readFileSync(
      new URL("../client/index.html", import.meta.url),
      "utf8"
    );
    expect(html).not.toContain('rel="manifest"');
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/rasoi");
    expect(manifest.icons.some((icon: any) => icon.sizes === "512x512")).toBe(
      true
    );
    expect(manifest.icons).toContainEqual(expect.objectContaining({ src: "/staff-icon-192.png", sizes: "192x192", type: "image/png" }));
    expect(readFileSync(new URL("../client/public/staff.webmanifest", import.meta.url), "utf8")).toContain('"/staff-icon-192.png"');
  });
});
