import { afterEach, expect, it, vi } from "vitest";
import { checkoutAttempt, clearCheckoutAttempt } from "../client/src/lib/checkoutAttempt";
import { registerStorageProxy } from "./_core/storageProxy";

afterEach(() => vi.unstubAllGlobals());
it("reuses an uncertain checkout after reload but releases it after success", async () => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key),
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  const first = await checkoutAttempt("customer-private-details/cart-1");
  expect((await checkoutAttempt("customer-private-details/cart-1")).key).toBe(first.key);
  expect([...values.values()][0]).not.toContain("customer-private-details");
  expect((await checkoutAttempt("cart-2")).key).not.toBe(first.key);
  clearCheckoutAttempt();
  expect(values.size).toBe(0);
  expect((await checkoutAttempt("customer-private-details/cart-1")).key).not.toBe(first.key);
});
it("never contacts Forge for an anonymous legacy storage request", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  let handler: any;
  registerStorageProxy({ get: (_path: string, callback: any) => { handler = callback; } } as any);
  const response = { status: vi.fn().mockReturnThis(), send: vi.fn() };
  handler({ params: { 0: "private/customer.pdf" } }, response);
  expect(response.status).toHaveBeenCalledWith(404);
  expect(fetch).not.toHaveBeenCalled();
});
