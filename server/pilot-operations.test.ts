import { beforeEach, describe, expect, it, vi } from "vitest";
import { capturedPaymentIds, verifiedRefund, validatePrivacyTransition, orderingControl, pauseSchema } from "./pilot-operations";
import { readEntities } from "./durable-store";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { POLICY_VERSION } from "../shared/consent";
vi.mock("./durable-store", async original => ({ ...await original<typeof import("./durable-store")>(), readEntities: vi.fn() }));
beforeEach(() => { vi.mocked(readEntities).mockReset(); });
describe("pilot operational safeguards", () => {
  it("blocks direct customer checkout while paused", async () => {
    vi.mocked(readEntities).mockResolvedValue([{ paused: true }]);
    const caller = appRouter.createCaller({ user: null, req: { headers: {} }, res: {} } as unknown as TrpcContext);
    await expect(caller.order.create({ screen: "Screen 01", seat: "MS-A01", customerName: "Test Customer", phone: "9876543210", items: [{ itemId: "tea", quantity: 1 }], idempotencyKey: "f7f8a1e0-21dd-4e8b-b914-111111111111", consent: { policyVersion: POLICY_VERSION, terms: true, privacy: true, refund: true, cutoff: true } })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("reads the durable pause flag", async () => { vi.mocked(readEntities).mockResolvedValue([{ paused: true }]); expect(await orderingControl()).toEqual({ paused: true }); });
  it("does not report enabled when storage is unavailable", async () => { vi.mocked(readEntities).mockImplementation(async () => { throw new Error("offline"); }); let caught = false; try { await orderingControl(); } catch { caught = true; } expect(caught).toBe(true); });
  it("requires a reason for pause/resume", () => expect(pauseSchema.safeParse({ paused: true, reason: "" }).success).toBe(false));
  it("selects captured payments for the exact order only", () => expect(capturedPaymentIds({ items: [{ id: "pay_1", order_id: "order_1", status: "authorized" }, { id: "pay_2", order_id: "order_2", status: "captured" }, { id: "pay_3", order_id: "order_1", status: "captured" }] }, "order_1")).toEqual(["pay_3"]));
  const expected = { refundId: "rfnd_1", paymentId: "pay_1", amount: 100 };
  const refund = { id: "rfnd_1", payment_id: "pay_1", amount: 100, currency: "INR", status: "processed" };
  for (const [provider, local] of [["processed", "SUCCEEDED"], ["pending", "PROCESSING"], ["failed", "FAILED"]]) {
    it(`maps verified ${provider} refund`, () => expect(verifiedRefund({ ...refund, status: provider }, expected)).toBe(local));
  }
  for (const bad of [{ amount: 200 }, { payment_id: "pay_other" }, { id: "rfnd_other" }, { currency: "USD" }, { status: "unknown" }]) it(`rejects refund mismatch ${JSON.stringify(bad)}`, () => expect(() => verifiedRefund({ ...refund, ...bad }, expected)).toThrow());
  it("requires identity verification before resolution", () => expect(() => validatePrivacyTransition({ orderId: 1, type: "DELETION", status: "RESOLVED", legalHold: false, note: "test note", identityVerified: false })).toThrow());
  for (const role of [null, "KITCHEN", "MANAGER", "READ_ONLY"]) {
    it(`denies operational writes to ${role}`, async () => {
      const caller = appRouter.createCaller({ user: role ? { id: 12, role } : null, req: { headers: {} }, res: {} } as unknown as TrpcContext);
      await expect(caller.admin.setOrderingControl({ paused: true, reason: "Kitchen pause" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.admin.reconcilePayment({ orderId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.admin.syncRefund({ id: 1, refundId: "rfnd_1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.admin.privacyRequests()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  }
});
