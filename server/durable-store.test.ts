import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "./db";
import { database, persistOrder, persistStatus, readOrders, writeEntity } from "./durable-store";
import { verifyWebhook } from "./payment-webhook";
import { createHmac } from "node:crypto";
import type { KitchenOrder } from "@shared/cinebites";
import { orders, consentRecords, auditLogs } from "../drizzle/schema";
import { POLICY_VERSION } from "../shared/consent";

vi.mock("./db", () => ({ getDb: vi.fn() }));
const order: KitchenOrder = { id: "order-restart", orderNumber: "CB-RESTART", status: "NEW", screen: "Verified Screen", seat: "A1", customerName: "Test Customer", customerPhone: "9876543210", phoneLast4: "3210", totalPaise: 5000, platformFeePaise: 1000, items: [{ id: "item-1", name: "Tea", quantity: 1, pricePaise: 4000, options: [] }], source: "ONLINE", paymentStatus: "PENDING", createdAt: "2026-09-12T10:00:00.000Z", updatedAt: "2026-09-12T10:00:00.000Z" };
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NODE_ENV", "test"); });
afterEach(() => vi.unstubAllEnvs());

function fakeTransaction(selectResults: unknown[][]) {
  const writes: { table: unknown; value: any }[] = [];
  const tx: any = {
    select: () => ({ from: () => ({ where: () => ({ limit: () => {
      const result = selectResults.shift() ?? [];
      return Object.assign(Promise.resolve(result), { for: () => Promise.resolve(result) });
    } }) }) }),
    insert: (table: unknown) => ({ values: (value: unknown) => {
      writes.push({ table, value });
      return Object.assign(Promise.resolve(), { $returningId: async () => [{ id: 99 }], onDuplicateKeyUpdate: async () => undefined });
    } }),
    update: (table: unknown) => ({ set: (value: unknown) => ({ where: async () => { writes.push({ table, value }); } }) }),
  };
  vi.mocked(getDb).mockResolvedValue({ transaction: async (fn: any) => fn(tx) } as any);
  return writes;
}

describe("durable order storage", () => {
  it("persists exact screen and seat IDs, item snapshots and consent in one transaction", async () => {
    const writes = fakeTransaction([[{ id: 7 }], [{ payload: { paused: false } }], [{ id: 42 }]]);
    await persistOrder(order, { idempotencyKey: "request-1", consent: { policyVersion: POLICY_VERSION, terms: true, privacy: true, refund: true, cutoff: true }, showtimeId: 12 });
    expect(writes.find(w => w.table === orders)?.value).toMatchObject({ screenId: 7, seatId: 42, snapshot: order, publicId: order.id, idempotencyKey: "request-1", showtimeId: 12 });
    expect(writes.find(w => w.table === consentRecords)?.value).toMatchObject({ orderId: 99, terms: 1, privacy: 1, refund: 1, retention: 0, support: 0, policyVersion: POLICY_VERSION, createdAt: expect.any(Date) });
    const evidence = writes.find(w => w.table === auditLogs && w.value.action === "CHECKOUT_CONSENT")?.value;
    expect(JSON.parse(evidence.detail)).toMatchObject({ orderId: 99, cutoff: true, policyVersion: POLICY_VERSION, acceptedAt: expect.any(String) });
    expect(writes.some(w => w.table === auditLogs)).toBe(true);
  });
  it("rejects an unconfigured screen without writing an order", async () => {
    const writes = fakeTransaction([[]]);
    await expect(persistOrder(order, {})).rejects.toThrow("Screen is not configured");
    expect(writes).toEqual([]);
  });
  it("rejects a seat outside the selected screen", async () => {
    const writes = fakeTransaction([[{ id: 7 }], [{ payload: { paused: false } }], []]);
    await expect(persistOrder(order, {})).rejects.toThrow("Seat is not configured");
    expect(writes.every(w => w.value.kind === "ordering")).toBe(true);
  });
  it("reads persisted orders independently of the process-memory store", async () => {
    vi.mocked(getDb).mockResolvedValue({ select: () => ({ from: () => ({ orderBy: async () => [{ snapshot: order, status: "READY", paymentStatus: "CONFIRMED", updatedAt: new Date("2026-09-12T10:15:00Z") }] }) }) } as any);
    expect(await readOrders()).toEqual([{ ...order, status: "READY", paymentStatus: "CONFIRMED", updatedAt: "2026-09-12T10:15:00.000Z" }]);
  });
  it("does not silently discard legacy orders without snapshots", async () => {
    vi.mocked(getDb).mockResolvedValue({ select: () => ({ from: () => ({ orderBy: async () => [{ snapshot: null }] }) }) } as any);
    await expect(readOrders()).rejects.toThrow("Legacy orders");
  });
  it("rejects stale kitchen updates before writing", async () => {
    const writes = fakeTransaction([[{ id: 99, status: "READY", paymentStatus: "CONFIRMED" }]]);
    await expect(persistStatus({ ...order, status: "PREPARING" }, "NEW", "staff")).rejects.toThrow("Order changed");
    expect(writes).toEqual([]);
  });
  it("refuses memory-only operation outside automated tests", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.mocked(getDb).mockResolvedValue(null);
    await expect(database()).rejects.toThrow("non-durable");
  });
  it("does not use long email addresses directly as entity keys", async () => {
    const writes = fakeTransaction([]);
    await writeEntity("staff", "a".repeat(300), { role: "KITCHEN" }, "owner", "STAFF_INVITED");
    expect(writes[0].value.key).toMatch(/^staff:[a-f0-9]{64}$/);
  });
});

describe("Razorpay webhook signatures", () => {
  const body = Buffer.from('{"event":"payment.captured"}');
  const signature = createHmac("sha256", "webhook-test-secret").update(body).digest("hex");
  it("accepts exact signed bytes", () => expect(verifyWebhook(body, signature, "webhook-test-secret")).toBe(true));
  it("rejects a modified body", () => expect(verifyWebhook(Buffer.from(body.toString() + " "), signature, "webhook-test-secret")).toBe(false));
  it("rejects a missing secret and malformed signatures", () => {
    expect(verifyWebhook(body, signature, "")).toBe(false);
    expect(verifyWebhook(body, "z".repeat(64), "webhook-test-secret")).toBe(false);
    expect(verifyWebhook(body, undefined, "webhook-test-secret")).toBe(false);
  });
});
