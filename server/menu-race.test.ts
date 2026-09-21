import { describe, expect, it, vi } from "vitest";
import { persistOrder, persistStatus } from "./durable-store";
const mock = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mock.getDb }));
function fixture(results: unknown[][]) {
  const locked = vi.fn();
  const deleted = vi.fn();
  const inserted = vi.fn();
  const db: any = {
    transaction: async (fn: any) => fn(db),
    select: () => {
      const result = results.shift() ?? [];
      const c: any = {
        from: () => c,
        where: () => c,
        limit: () => c,
        for: () => {
          locked();
          return c;
        },
        then: (resolve: any) => Promise.resolve(result).then(resolve),
      };
      return c;
    },
    insert: () => ({
      values: (value: any) => {
        inserted(value);
        return { $returningId: async () => [{ id: 1 }], onDuplicateKeyUpdate: async () => {} };
      },
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({
      where: async (where: any) => {
        deleted(where);
      },
    }),
  };
  mock.getDb.mockResolvedValue(db);
  return { locked, deleted, inserted };
}
const order: any = {
  orderNumber: `CB-${"A".repeat(24)}`,
  screen: "Screen",
  seat: "A1",
  items: [{ pricePaise: 10000 }],
  status: "DELIVERED",
  paymentStatus: "CONFIRMED",
};
describe("checkout and delivery transaction guards", () => {
  it("rejects a pause committed after the route's initial check", async () => {
    const f = fixture([[{ id: 1 }], [{ payload: { paused: true } }]]);
    await expect(persistOrder(order, { items: [] })).rejects.toThrow("paused");
    expect(f.inserted.mock.calls.every(([value]) => value.kind === "ordering")).toBe(true);
  });
  it("rejects an item disabled after the initial menu read", async () => {
    const f = fixture([[{ id: 1 }], [{ payload: { paused: false } }], [{ payload: { available: false } }]]);
    await expect(
      persistOrder(order, { items: [{ itemId: "food", quantity: 1 }] })
    ).rejects.toThrow("sold out");
    expect(f.locked).toHaveBeenCalled();
    expect(f.inserted.mock.calls.every(([value]) => value.kind === "ordering")).toBe(true);
  });
  it("rejects a price changed before persistence", async () => {
    fixture([
      [{ id: 1 }],
      [{ payload: { paused: false } }],
      [{ payload: { available: true, pricePaise: 11000, options: [] } }],
    ]);
    await expect(
      persistOrder(order, { items: [{ itemId: "food", quantity: 1 }] })
    ).rejects.toThrow("Menu changed");
  });
  it("deletes chat in the same delivery transaction", async () => {
    const f = fixture([
      [{ id: 1, status: "READY", paymentStatus: "CONFIRMED" }],
    ]);
    await persistStatus(order, "READY", "staff");
    expect(f.locked).toHaveBeenCalled();
    expect(f.deleted).toHaveBeenCalledTimes(1);
  });
  it("does not delete chat when a stale delivery update is rejected", async () => {
    const f = fixture([[{ id: 1, status: "NEW", paymentStatus: "CONFIRMED" }]]);
    await expect(persistStatus(order, "READY", "staff")).rejects.toThrow(
      "Order changed"
    );
    expect(f.deleted).not.toHaveBeenCalled();
  });
});
