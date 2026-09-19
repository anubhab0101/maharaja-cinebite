import { afterEach, expect, it, vi } from "vitest";
import { readCart, saveCart } from "../client/src/lib/cartStorage";

afterEach(() => vi.unstubAllGlobals());
it("restores bounded quantities without prices or customer data", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key),
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  saveCart([{ id: "popcorn", quantity: 2, price: 1, phone: "private" } as any]);
  expect(readCart()).toEqual([{ id: "popcorn", quantity: 2 }]);
  expect([...values.values()][0]).not.toMatch(/price|private|phone/);
  values.set("cinebite-cart-v1", JSON.stringify({ savedAt: Date.now(), lines: [{id:"popcorn",quantity:999}] }));
  expect(readCart()).toEqual([]);
  values.set("cinebite-cart-v1", JSON.stringify({ savedAt: Date.now() - 86400001, lines: [{id:"popcorn",quantity:1}] }));
  expect(readCart()).toEqual([]);
  saveCart([]);
  expect(values.size).toBe(0);
});
it("works when browser storage is denied", () => {
  vi.stubGlobal("localStorage", { getItem: () => { throw Error("denied"); }, setItem: () => { throw Error("denied"); } });
  expect(readCart()).toEqual([]);
  expect(() => saveCart([{id:"popcorn",quantity:1}])).not.toThrow();
});
