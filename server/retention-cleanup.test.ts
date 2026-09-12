import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupOrder } from "./retention-cleanup";
import { database } from "./durable-store";
vi.mock("./durable-store", () => ({ database: vi.fn() }));
const approval = { reference: "REVIEW_123", allRetentionExpired: true, noDisputeOrLegalHold: true, externalCopiesReviewed: true } as const;
function setup(date = "2024-01-01T00:00:00Z", hold = false) {
  const rows = [[{ id: 1, publicId: "order-1", orderNumber: "CB-1", status: "DELIVERED", paymentStatus: "CONFIRMED", snapshot: {}, createdAt: new Date(date), updatedAt: new Date(date) }], [], [], [], [], hold ? [{ key: "privacy:1", payload: { orderId: 1, legalHold: true, status: "RESOLVED" } }] : []];
  const remove = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
  const receipt = vi.fn().mockResolvedValue(undefined);
  const tx = { select: () => ({ from: () => ({ where: () => {
    const value = rows.shift();
    return Object.assign(Promise.resolve(value), { limit: () => ({ for: async () => value }) });
  } }) }), delete: remove, insert: () => ({ values: receipt }) };
  vi.mocked(database).mockResolvedValue({ transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } as never);
  return { remove, receipt };
}
beforeEach(() => vi.resetAllMocks());
describe("reviewed retention cleanup", () => {
  it("cannot override a registered legal hold with a release", async () => { const { remove } = setup("2024-01-01", true); await expect(cleanupOrder("CB-1", approval, new Date("2026-01-01"))).rejects.toThrow("hold"); expect(remove).not.toHaveBeenCalled(); });
  it("preview never writes", async () => { const { remove, receipt } = setup(); expect((await cleanupOrder("CB-1", undefined, new Date("2026-01-01"))).mode).toBe("PREVIEW"); expect(remove).not.toHaveBeenCalled(); expect(receipt).not.toHaveBeenCalled(); });
  it("deletes only after review and minimum age", async () => { const { remove, receipt } = setup(); expect((await cleanupOrder("CB-1", approval, new Date("2026-01-01"))).mode).toBe("DELETED"); expect(remove).toHaveBeenCalledTimes(5); expect(JSON.stringify(receipt.mock.calls)).not.toContain("CB-1"); });
  it("cannot override minimum age with a release", async () => { const { remove } = setup("2026-01-01"); await expect(cleanupOrder("CB-1", approval, new Date("2026-02-01"))).rejects.toThrow("Deletion blocked"); expect(remove).not.toHaveBeenCalled(); });
  it("rejects an invalid release reference before writes", async () => { const { remove } = setup(); await expect(cleanupOrder("CB-1", { ...approval, reference: "bad" }, new Date("2026-01-01"))).rejects.toThrow("release"); expect(remove).not.toHaveBeenCalled(); });
});
