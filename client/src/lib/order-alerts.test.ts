import { describe, expect, it } from "vitest";
import { newConfirmedOrders } from "./order-alerts";
describe("staff order alerts", () => {
  it("alerts only unseen, confirmed, new orders", () => {
    expect(
      newConfirmedOrders(
        [
          { id: "new", status: "NEW", paymentStatus: "CONFIRMED" },
          { id: "seen", status: "NEW", paymentStatus: "CONFIRMED" },
          { id: "pending", status: "NEW", paymentStatus: "PENDING" },
          { id: "done", status: "DELIVERED", paymentStatus: "CONFIRMED" },
        ],
        new Set(["seen"])
      ).map(o => o.id)
    ).toEqual(["new"]);
  });
  it("does not repeat a reconciled event already in the queue", () => {
    const orders = [{ id: "one", status: "NEW", paymentStatus: "CONFIRMED" }];
    const seen = new Set<string>();
    expect(newConfirmedOrders(orders, seen)).toHaveLength(1);
    seen.add("one");
    expect(newConfirmedOrders(orders, seen)).toEqual([]);
  });
});
