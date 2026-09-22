import { afterEach, expect, it, vi } from "vitest";
import { startSelfPing } from "./_core/self-ping";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const env = { NODE_ENV: "production", RENDER: "true", RENDER_EXTERNAL_URL: "https://test-cinebites.onrender.com" };
it("pings every 60 seconds and stops on cleanup", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, service: "cinebites" }) });
  vi.stubGlobal("fetch", fetch);
  const stop = startSelfPing(env);
  await vi.advanceTimersByTimeAsync(59_999);
  expect(fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetch).toHaveBeenCalledTimes(2);
  stop();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not ping from development or an untrusted URL", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  startSelfPing({ ...env, NODE_ENV: "development" });
  startSelfPing({ ...env, RENDER_EXTERNAL_URL: "http://127.0.0.1" });
  await vi.advanceTimersByTimeAsync(120_000);
  expect(fetch).not.toHaveBeenCalled();
});
