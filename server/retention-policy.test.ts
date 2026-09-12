import { describe, expect, it } from "vitest";
import { retentionDecision, retentionDueAt } from "./retention-policy";
const base = { status: "DELIVERED", paymentStatus: "CONFIRMED", refundCount: 0, hasSnapshot: true, dates: [new Date("2025-09-12T10:00:00Z")] };
describe("retention safeguards", () => {
  it("blocks even a millisecond before one calendar year", () => expect(retentionDecision(base, new Date("2026-09-12T09:59:59.999Z")).eligibleForReview).toBe(false));
  it("permits review, not automatic deletion, at the anniversary", () => expect(retentionDecision(base, new Date("2026-09-12T10:00:00Z")).eligibleForReview).toBe(true));
  it("uses the newest processing date", () => expect(retentionDueAt([...base.dates, new Date("2026-01-01T00:00:00Z")]).toISOString()).toBe("2027-01-01T00:00:00.000Z"));
  it("handles leap day conservatively", () => expect(retentionDueAt([new Date("2024-02-29T00:00:00Z")]).toISOString()).toBe("2025-03-01T00:00:00.000Z"));
  for (const change of [{ status: "READY" }, { paymentStatus: "PENDING" }, { paymentStatus: "FAILED" }, { refundCount: 1 }, { hasSnapshot: false }]) {
    it(`blocks ${JSON.stringify(change)}`, () => expect(retentionDecision({ ...base, ...change }, new Date("2035-01-01")).eligibleForReview).toBe(false));
  }
  it("rejects unknown dates", () => { expect(() => retentionDueAt([])).toThrow(); expect(() => retentionDueAt([new Date("bad")])).toThrow(); });
});
